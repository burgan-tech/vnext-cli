#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const RefResolver = require('./lib/ref-resolver');

program
  .name('amorphie')
  .description('CLI for creating and managing Amorphie domain projects')
  .version('1.0.0');

// Create command (existing functionality)
program
  .command('create [project-name]')
  .description('Create a new Amorphie domain project')
  .action(async (projectName) => {
    try {
      let name = projectName;
      let domainName;
      
      // Get project name if not provided
      if (!name) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'projectName',
            message: 'What is your project name?',
            validate: (input) => {
              if (input.trim() === '') {
                return 'Project name is required';
              }
              return true;
            }
          }
        ]);
        name = answers.projectName;
      }

      // Get domain name
      const domainAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'domainName',
          message: 'What is your domain name? (lowercase letters and hyphens only):',
          validate: (input) => {
            if (input.trim() === '') {
              return 'Domain name is required';
            }
            // Regex: lowercase letters and hyphens only
            const domainRegex = /^[a-z]+(-[a-z]+)*$/;
            if (!domainRegex.test(input.trim())) {
              return 'Domain name must contain only lowercase letters and hyphens (e.g., "core", "user-management")';
            }
            return true;
          },
          filter: (input) => input.trim().toLowerCase()
        }
      ]);
      domainName = domainAnswers.domainName;

      const targetPath = path.join(process.cwd(), name);
      
      // Check if directory already exists
      if (await fs.pathExists(targetPath)) {
        console.log(chalk.red(`Error: Directory ${name} already exists`));
        process.exit(1);
      }

      // Create project directory
      await fs.ensureDir(targetPath);
      
      // Copy template files
      const templatePath = path.join(__dirname, 'template');
      await copyTemplate(templatePath, targetPath, name, domainName);
      
      console.log(chalk.green(`✅ Successfully created ${name}`));
      console.log(chalk.blue('📁 Project structure:'));
      console.log(`
├── ${domainName}/
│   ├── Workflows/
│   ├── Functions/
│   ├── Views/
│   ├── Extensions/
│   ├── Schemas/
│   └── Tasks/
├── .vscode/
├── amorphie.config.json
├── .cursorrules
├── README.md
└── package.json
      `);
      
      console.log(chalk.yellow('\n🚀 Next steps:'));
      console.log(`  cd ${name}`);
      console.log('  npm install');
      console.log('  amorphie validate --resolve-refs');
      console.log('  code .');
      
    } catch (error) {
      console.error(chalk.red('Error creating project:'), error.message);
      process.exit(1);
    }
  });

// Validate command with reference resolution
program
  .command('validate')
  .description('Validate domain components and resolve references')
  .option('--resolve-refs', 'Resolve and validate all ref references')
  .option('--strict', 'Enable strict validation mode')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🔍 Validating domain components...'));
      
      // Load amorphie.config.json
      const configPath = path.join(process.cwd(), 'amorphie.config.json');
      if (!(await fs.pathExists(configPath))) {
        console.log(chalk.red('❌ amorphie.config.json not found. Run this command in an Amorphie domain project.'));
        process.exit(1);
      }

      const config = await fs.readJSON(configPath);
      
      // Create resolver with config-based options
      const resolver = new RefResolver({
        strictMode: options.strict || config.referenceResolution?.strictMode,
        validateReferenceConsistency: config.referenceResolution?.validateReferenceConsistency !== false,
        validateSchemas: config.referenceResolution?.validateSchemas !== false,
        schemaPath: path.join(__dirname, 'template', '.vscode', 'schemas')
      });
      
      // Load additional config
      await resolver.loadValidationConfig(configPath);

      let totalFiles = 0;
      let validFiles = 0;
      let totalRefs = 0;
      let validRefs = 0;

      // Scan all JSON files
      const scanPath = path.join(process.cwd(), config.paths?.componentsRoot || config.domain);
      const jsonFiles = await findJsonFiles(scanPath);

      for (const filePath of jsonFiles) {
        totalFiles++;
        
        try {
          const content = await fs.readJSON(filePath);
          console.log(chalk.gray(`📄 Validating: ${path.relative(process.cwd(), filePath)}`));
          
          if (options.resolveRefs) {
            const validation = await resolver.validateAllReferences(content, config.domain);
            
            totalRefs += validation.resolvedRefs.length;
            validRefs += validation.resolvedRefs.filter(r => r.status === 'success').length;
            
            if (validation.valid) {
              validFiles++;
              console.log(chalk.green(`  ✅ Valid (${validation.validationDetails.successful}/${validation.validationDetails.total} refs resolved)`));
              
              // Show detailed validation info in verbose mode
              if (validation.validationDetails.total > 0) {
                validation.resolvedRefs.forEach(ref => {
                  if (ref.status === 'success' && ref.details) {
                    console.log(chalk.gray(`    📄 ${ref.details.componentType}: ${ref.details.key}@${ref.details.version} (${ref.details.domain})`));
                  }
                });
              }
            } else {
              console.log(chalk.red(`  ❌ Validation failed (${validation.validationDetails.failed}/${validation.validationDetails.total} refs failed):`));
              validation.errors.forEach(error => {
                console.log(chalk.red(`    - ${error.ref}:`));
                console.log(chalk.red(`      ${error.error}`));
              });
            }
          } else {
            validFiles++;
            console.log(chalk.green('  ✅ Valid JSON syntax'));
          }
        } catch (error) {
          console.log(chalk.red(`  ❌ Error: ${error.message}`));
        }
      }

      console.log(chalk.blue('\n📊 Validation Summary:'));
      console.log(`Files: ${validFiles}/${totalFiles} valid`);
      if (options.resolveRefs) {
        console.log(`References: ${validRefs}/${totalRefs} resolved`);
      }
      
      if (validFiles === totalFiles && validRefs === totalRefs) {
        console.log(chalk.green('🎉 All validations passed!'));
      } else {
        console.log(chalk.yellow('⚠️  Some validations failed. Check the output above.'));
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red('Validation error:'), error.message);
      process.exit(1);
    }
  });

// Build command (extract public + validate + resolve refs)
program
  .command('build')
  .description('Build domain package with validation and reference resolution')
  .option('-o, --output <dir>', 'Output directory', 'dist')
  .option('-t, --type <type>', 'Build type: reference (exports only) or runtime (complete)', 'reference')
  .option('--skip-validation', 'Skip schema validation during build')
  .action(async (options) => {
    try {
      // Validate build type
      if (!['reference', 'runtime'].includes(options.type)) {
        console.log(chalk.red('❌ Invalid build type. Use "reference" or "runtime".'));
        process.exit(1);
      }

      console.log(chalk.blue(`🏗️  Building ${options.type} package...`));
      
      const configPath = path.join(process.cwd(), 'amorphie.config.json');
      if (!(await fs.pathExists(configPath))) {
        console.log(chalk.red('❌ amorphie.config.json not found.'));
        process.exit(1);
      }

      const config = await fs.readJSON(configPath);
      const outputDir = path.join(process.cwd(), options.output);
      
      // Step 1: Validation (unless skipped)
      if (!options.skipValidation) {
        console.log(chalk.blue('\n📋 Step 1: Validating components...'));
        
        const resolver = new RefResolver({
          strictMode: config.referenceResolution?.strictMode,
          validateReferenceConsistency: config.referenceResolution?.validateReferenceConsistency !== false,
          validateSchemas: config.referenceResolution?.validateSchemas !== false,
          schemaPath: path.join(__dirname, 'template', '.vscode', 'schemas')
        });
        
        await resolver.loadValidationConfig(configPath);
        
        let totalFiles = 0;
        let validFiles = 0;
        
        const scanPath = path.join(process.cwd(), config.paths?.componentsRoot || config.domain);
        const jsonFiles = await findJsonFiles(scanPath);
        
        for (const filePath of jsonFiles) {
          totalFiles++;
          
          try {
            const content = await fs.readJSON(filePath);
            const validation = await resolver.validateAllReferences(content, config.domain);
            
            if (validation.valid) {
              validFiles++;
              console.log(chalk.green(`    ✅ ${path.relative(process.cwd(), filePath)}`));
            } else {
              console.log(chalk.red(`    ❌ ${path.relative(process.cwd(), filePath)} - Validation failed`));
              validation.errors.forEach(error => {
                console.log(chalk.red(`      - ${error.ref}: ${error.error}`));
              });
            }
          } catch (error) {
            console.log(chalk.red(`    ❌ ${path.relative(process.cwd(), filePath)} - ${error.message}`));
          }
        }
        
        if (validFiles !== totalFiles) {
          console.log(chalk.red(`\n❌ Build failed: ${totalFiles - validFiles} components failed validation`));
          process.exit(1);
        }
        
        console.log(chalk.green(`✅ All ${totalFiles} components validated successfully`));
      }
      
      // Step 2: Clean output directory
      console.log(chalk.blue('\n📦 Step 2: Preparing build directory...'));
      await fs.remove(outputDir);
      await fs.ensureDir(outputDir);

      // Step 3: Prepare and copy configuration files with build type modifications
      await fs.writeJSON(path.join(outputDir, 'amorphie.config.json'), config, { spaces: 2 });
      
      const packagePath = path.join(process.cwd(), 'package.json');
      if (await fs.pathExists(packagePath)) {
        const packageJson = await fs.readJSON(packagePath);
        const originalPackageName = packageJson.name;
        
        // Modify package name based on build type
        if (options.type === 'reference') {
          packageJson.name = `${originalPackageName}-reference`;
          packageJson.description = `${packageJson.description || ''} (Reference Package for Cross-Domain Usage)`.trim();
        } else if (options.type === 'runtime') {
          packageJson.name = `${originalPackageName}-runtime`;
          packageJson.description = `${packageJson.description || ''} (Runtime Package for Engine Deployment)`.trim();
        }
        
        // Add build type metadata
        packageJson.amorphie = {
          ...packageJson.amorphie,
          buildType: options.type,
          buildTimestamp: new Date().toISOString(),
          originalPackage: originalPackageName
        };
        
        await fs.writeJSON(path.join(outputDir, 'package.json'), packageJson, { spaces: 2 });
        console.log(chalk.green(`  ✅ Created ${options.type} package.json: ${packageJson.name}`));
      }

      // Step 4: Process and copy components based on build type
      let copiedFiles = 0;
      
      if (options.type === 'reference') {
        console.log(chalk.blue('\n🔗 Step 3: Processing exported components with reference resolution...'));
        
        const resolver = new RefResolver({
          schemaPath: path.join(__dirname, 'template', '.vscode', 'schemas')
        });
        await resolver.loadValidationConfig(configPath);

        if (config.exports) {
          const domainPath = path.join(process.cwd(), config.paths?.componentsRoot || config.domain);
          
          for (const [category, files] of Object.entries(config.exports)) {
            if (Array.isArray(files)) {
              const categoryPath = config.paths[category] || category;
              
              for (const filename of files) {
                const sourcePath = path.join(domainPath, categoryPath, filename);
                const targetPath = path.join(outputDir, config.domain, categoryPath, filename);
                
                if (await fs.pathExists(sourcePath)) {
                  await fs.ensureDir(path.dirname(targetPath));
                  
                  // Read, resolve references, and write processed file
                  const originalContent = await fs.readJSON(sourcePath);
                  const processedContent = await resolveReferencesToPayload(originalContent, resolver, config.domain);
                  
                  await fs.writeJSON(targetPath, processedContent, { spaces: 2 });
                  console.log(chalk.green(`  ✅ Processed (reference): ${categoryPath}/${filename}`));
                  copiedFiles++;
                } else {
                  console.log(chalk.yellow(`  ⚠️  Not found: ${categoryPath}/${filename}`));
                }
              }
            }
          }
        }
        
      } else if (options.type === 'runtime') {
        console.log(chalk.blue('\n📁 Step 3: Processing complete domain structure with reference resolution...'));
        
        const resolver = new RefResolver({
          schemaPath: path.join(__dirname, 'template', '.vscode', 'schemas')
        });
        await resolver.loadValidationConfig(configPath);
        
        const domainPath = path.join(process.cwd(), config.paths?.componentsRoot || config.domain);
        const targetDomainPath = path.join(outputDir, config.domain);
        
        if (await fs.pathExists(domainPath)) {
          console.log(chalk.gray(`📁 Source domain path: ${domainPath}`));
          console.log(chalk.gray(`📁 Target domain path: ${targetDomainPath}`));
          
          // Get all files recursively
          const allFiles = await getAllFiles(domainPath);
          console.log(chalk.gray(`📄 Found ${allFiles.length} files to process`));
          
          for (const filePath of allFiles) {
            const targetPath = path.join(targetDomainPath, path.relative(domainPath, filePath));
            await fs.ensureDir(path.dirname(targetPath));
            
            const relativePath = path.relative(domainPath, filePath);
            
            // Process JSON files with reference resolution
            if (path.extname(filePath) === '.json') {
              try {
                console.log(chalk.gray(`🔄 Processing JSON: ${relativePath}`));
                const originalContent = await fs.readJSON(filePath);
                const processedContent = await resolveReferencesToPayload(originalContent, resolver, config.domain);
                await fs.writeJSON(targetPath, processedContent, { spaces: 2 });
                console.log(chalk.green(`✅ Processed: ${relativePath}`));
                copiedFiles++;
              } catch (error) {
                console.log(chalk.yellow(`⚠️  JSON processing failed for ${relativePath}, copying as-is: ${error.message}`));
                // If JSON processing fails, copy as-is
                await fs.copy(filePath, targetPath);
                if (path.extname(filePath) === '.json') copiedFiles++;
              }
            } else {
              // Copy non-JSON files as-is
              console.log(chalk.gray(`📄 Copying non-JSON: ${relativePath}`));
              await fs.copy(filePath, targetPath);
            }
          }
          
          console.log(chalk.green(`  ✅ Processed complete domain structure with reference resolution`));
          console.log(chalk.gray(`    - ${copiedFiles} JSON component files processed`));
          console.log(chalk.gray(`    - All supporting files and folders copied`));
        } else {
          console.log(chalk.red(`  ❌ Domain directory not found: ${domainPath}`));
        }
      }

      console.log(chalk.blue(`\n📊 Build Summary:`));
      console.log(`Build type: ${options.type}`);
      console.log(`Files processed: ${copiedFiles}`);
      console.log(`Output directory: ${outputDir}`);
      
      if (options.type === 'reference') {
        console.log(chalk.gray('Package contents: Exported components only (for cross-domain usage)'));
      } else {
        console.log(chalk.gray('Package contents: Complete domain structure (for runtime deployment)'));
      }
      
      console.log(chalk.green(`🎉 ${options.type.charAt(0).toUpperCase() + options.type.slice(1)} package built successfully!`));

    } catch (error) {
      console.error(chalk.red('Build error:'), error.message);
      process.exit(1);
    }
  });

// Publish command
program
  .command('publish')
  .description('Publish domain package to NPM registry')
  .option('-t, --type <type>', 'Publish type: reference (exports only) or runtime (complete)', 'reference')
  .option('--dry-run', 'Show what would be published without actually publishing')
  .option('--registry <url>', 'NPM registry URL')
  .action(async (options) => {
    try {
      // Validate publish type
      if (!['reference', 'runtime'].includes(options.type)) {
        console.log(chalk.red('❌ Invalid publish type. Use "reference" or "runtime".'));
        process.exit(1);
      }

      console.log(chalk.blue(`🚀 Publishing ${options.type} package...`));
      
      // First build the package (this includes validation and reference resolution)
      console.log(chalk.blue(`Building ${options.type} package for publication...`));
      await buildPackage('dist', options.type);
      
      const distPath = path.join(process.cwd(), 'dist');
      
      if (options.dryRun) {
        console.log(chalk.yellow('📋 Dry run mode - showing what would be published:'));
        const files = await getAllFiles(distPath);
        files.forEach(file => {
          console.log(`  ${path.relative(distPath, file)}`);
        });
        return;
      }

      // Run npm publish in dist directory
      const { execSync } = require('child_process');
      const publishCmd = options.registry 
        ? `npm publish --registry ${options.registry}`
        : 'npm publish';

      try {
        execSync(publishCmd, { 
          cwd: distPath, 
          stdio: 'inherit' 
        });
        console.log(chalk.green('🎉 Package published successfully!'));
      } catch (error) {
        console.log(chalk.red('❌ Publish failed:'), error.message);
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red('Publish error:'), error.message);
      process.exit(1);
    }
  });

// List exports command
program
  .command('list-exports [package-name]')
  .description('List exported components from a domain package')
  .action(async (packageName) => {
    try {
      const resolver = new RefResolver();
      
      if (packageName) {
        // List exports from external package
        console.log(chalk.blue(`📋 Listing exports from ${packageName}...`));
        
        const exports = await resolver.listPackageExports(packageName);
        
        console.log(chalk.green(`\n📦 ${exports.packageName}`));
        console.log(`Domain: ${exports.domain}`);
        console.log(`Version: ${exports.version}`);
        console.log(`Description: ${exports.description}`);
        
        if (exports.exports && Object.keys(exports.exports).length > 0) {
          console.log(chalk.blue('\n🔗 Exported Components:'));
          
          for (const [category, files] of Object.entries(exports.exports)) {
            if (Array.isArray(files) && files.length > 0) {
              console.log(chalk.yellow(`\n  ${category.toUpperCase()}:`));
              files.forEach(file => {
                console.log(`    - ${file}`);
              });
            }
          }
        } else {
          console.log(chalk.gray('\n  No exported components found.'));
        }
        
      } else {
        // List exports from current project
        console.log(chalk.blue('📋 Listing exports from current project...'));
        
        const configPath = path.join(process.cwd(), 'amorphie.config.json');
        if (!(await fs.pathExists(configPath))) {
          console.log(chalk.red('❌ amorphie.config.json not found.'));
          process.exit(1);
        }

        const config = await fs.readJSON(configPath);
        
        console.log(chalk.green(`\n📦 ${config.domain} (current project)`));
        console.log(`Version: ${config.version}`);
        console.log(`Description: ${config.description}`);
        
        if (config.exports) {
          console.log(chalk.blue('\n🔗 Exported Components:'));
          
          for (const [category, files] of Object.entries(config.exports)) {
            if (Array.isArray(files) && files.length > 0) {
              console.log(chalk.yellow(`\n  ${category.toUpperCase()}:`));
              files.forEach(file => {
                console.log(`    - ${file}`);
              });
            }
          }
        } else {
          console.log(chalk.gray('\n  No exported components configured.'));
        }
      }

    } catch (error) {
      console.error(chalk.red('Error listing exports:'), error.message);
      process.exit(1);
    }
  });

// Visualize boundaries command
program
  .command('visualize-boundaries')
  .description('Generate domain boundary visualization')
  .option('-f, --format <format>', 'Output format (json, mermaid, dot)', 'json')
  .option('-o, --output <file>', 'Output file path')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🗺️  Generating domain boundary visualization...'));
      
      const configPath = path.join(process.cwd(), 'amorphie.config.json');
      if (!(await fs.pathExists(configPath))) {
        console.log(chalk.red('❌ amorphie.config.json not found.'));
        process.exit(1);
      }

      const config = await fs.readJSON(configPath);
      const resolver = new RefResolver();
      
      // Scan all JSON files for references
      const scanPath = path.join(process.cwd(), config.paths?.componentsRoot || config.domain);
      const jsonFiles = await findJsonFiles(scanPath);
      
      const boundaries = {
        domain: config.domain,
        version: config.version,
        dependencies: [],
        components: [],
        references: []
      };

      for (const filePath of jsonFiles) {
        try {
          const content = await fs.readJSON(filePath);
          const relativePath = path.relative(scanPath, filePath);
          
          boundaries.components.push({
            path: relativePath,
            type: resolver.detectComponentType(relativePath),
            key: content.key || path.basename(filePath, '.json')
          });

          const validation = await resolver.validateAllReferences(content, config.domain);
          
          validation.resolvedRefs.forEach(ref => {
            boundaries.references.push({
              from: relativePath,
              to: ref.ref,
              status: ref.status,
              resolvedFrom: ref.resolved
            });
            
            // Extract external dependencies
            if (ref.ref.startsWith('@') && ref.status === 'success') {
              const packageMatch = ref.ref.match(/^(@[^/]+\/[^/]+)/);
              if (packageMatch && !boundaries.dependencies.includes(packageMatch[1])) {
                boundaries.dependencies.push(packageMatch[1]);
              }
            }
          });
          
        } catch (error) {
          console.log(chalk.gray(`  Skipping ${path.relative(process.cwd(), filePath)}: ${error.message}`));
        }
      }

      // Generate output based on format
      let output = '';
      
      switch (options.format) {
        case 'json':
          output = JSON.stringify(boundaries, null, 2);
          break;
          
        case 'mermaid':
          output = generateMermaidDiagram(boundaries);
          break;
          
        case 'dot':
          output = generateDotDiagram(boundaries);
          break;
          
        default:
          console.log(chalk.red(`❌ Unknown format: ${options.format}`));
          process.exit(1);
      }

      if (options.output) {
        await fs.writeFile(options.output, output);
        console.log(chalk.green(`✅ Visualization saved to ${options.output}`));
      } else {
        console.log('\n' + output);
      }

      console.log(chalk.blue(`\n📊 Boundary Analysis:`));
      console.log(`Components: ${boundaries.components.length}`);
      console.log(`References: ${boundaries.references.length}`);
      console.log(`External Dependencies: ${boundaries.dependencies.length}`);

    } catch (error) {
      console.error(chalk.red('Visualization error:'), error.message);
      process.exit(1);
    }
  });

// Helper functions (existing and new)
async function copyTemplate(templatePath, targetPath, projectName, domainName) {
  const items = await fs.readdir(templatePath);
  
  console.log('📂 Files found in template:', items);
  console.log('🔍 Hidden files:', items.filter(item => item.startsWith('.')));
  
  for (const item of items) {
    const sourcePath = path.join(templatePath, item);
    const stat = await fs.stat(sourcePath);
    
    if (stat.isDirectory()) {
      if (item === '{domainName}') {
        const actualTargetPath = path.join(targetPath, domainName);
        await copyDirectoryRecursive(sourcePath, actualTargetPath, projectName, domainName);
      } else {
        const targetItemPath = path.join(targetPath, item);
        await copyDirectoryRecursive(sourcePath, targetItemPath, projectName, domainName);
      }
    } else {
      const targetItemPath = path.join(targetPath, item);
      console.log(`📄 Copying file: ${item}`);
      await copyFileWithPlaceholders(sourcePath, targetItemPath, projectName, domainName);
    }
  }
  
  const criticalFiles = ['.gitignore', '.cursorrules'];
  for (const file of criticalFiles) {
    const sourcePath = path.join(templatePath, file);
    const targetPath_file = path.join(targetPath, file);
    
    if (await fs.pathExists(sourcePath) && !(await fs.pathExists(targetPath_file))) {
      console.log(`⚠️  Missing critical file ${file}, copying now...`);
      await copyFileWithPlaceholders(sourcePath, targetPath_file, projectName, domainName);
    }
  }
}

async function copyDirectoryRecursive(sourcePath, targetPath, projectName, domainName) {
  await fs.ensureDir(targetPath);
  
  const items = await fs.readdir(sourcePath);
  
  for (const item of items) {
    const sourceItemPath = path.join(sourcePath, item);
    const targetItemPath = path.join(targetPath, item);
    const stat = await fs.stat(sourceItemPath);
    
    if (stat.isDirectory()) {
      await copyDirectoryRecursive(sourceItemPath, targetItemPath, projectName, domainName);
    } else {
      await copyFileWithPlaceholders(sourceItemPath, targetItemPath, projectName, domainName);
    }
  }
}

async function copyFileWithPlaceholders(sourcePath, targetPath, projectName, domainName) {
  const extname = path.extname(sourcePath);
  
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.otf', '.exe', '.dll', '.so', '.dylib'];
  
  if (binaryExtensions.includes(extname.toLowerCase())) {
    await fs.copy(sourcePath, targetPath);
    return;
  }
  
  try {
    let content = await fs.readFile(sourcePath, 'utf8');
    content = content.replace(/{packageName}/g, projectName);
    content = content.replace(/{domainName}/g, domainName);
    await fs.writeFile(targetPath, content);
  } catch (error) {
    await fs.copy(sourcePath, targetPath);
  }
}

async function findJsonFiles(dirPath) {
  const files = [];
  
  if (!(await fs.pathExists(dirPath))) {
    return files;
  }

  const items = await fs.readdir(dirPath);
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = await fs.stat(itemPath);
    
    if (stat.isDirectory()) {
      const subFiles = await findJsonFiles(itemPath);
      files.push(...subFiles);
    } else if (path.extname(item) === '.json') {
      files.push(itemPath);
    }
  }
  
  return files;
}

async function getAllFiles(dirPath) {
  const files = [];
  const items = await fs.readdir(dirPath);
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = await fs.stat(itemPath);
    
    if (stat.isDirectory()) {
      const subFiles = await getAllFiles(itemPath);
      files.push(...subFiles);
    } else {
      files.push(itemPath);
    }
  }
  
  return files;
}



function generateMermaidDiagram(boundaries) {
  let diagram = 'graph TD\n';
  
  // Add domain node
  diagram += `  ${boundaries.domain}[${boundaries.domain}]\n`;
  
  // Add dependency nodes
  boundaries.dependencies.forEach(dep => {
    const nodeId = dep.replace(/[@/-]/g, '_');
    diagram += `  ${nodeId}[${dep}]\n`;
    diagram += `  ${nodeId} --> ${boundaries.domain}\n`;
  });
  
  return diagram;
}

function generateDotDiagram(boundaries) {
  let diagram = 'digraph DomainBoundaries {\n';
  diagram += '  rankdir=LR;\n';
  diagram += '  node [shape=box];\n';
  
  // Add domain node
  diagram += `  "${boundaries.domain}" [style=filled, fillcolor=lightblue];\n`;
  
  // Add dependencies
  boundaries.dependencies.forEach(dep => {
    diagram += `  "${dep}" [style=filled, fillcolor=lightgray];\n`;
    diagram += `  "${dep}" -> "${boundaries.domain}";\n`;
  });
  
  diagram += '}\n';
  return diagram;
}

/**
 * Resolves all ref references in a JSON object to their payload equivalents
 * @param {Object} obj - JSON object to process
 * @param {RefResolver} resolver - Reference resolver instance
 * @param {string} currentDomain - Current domain context
 * @returns {Promise<Object>} Object with references resolved to payloads
 */
async function resolveReferencesToPayload(obj, resolver, currentDomain) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    const resolvedArray = [];
    for (const item of obj) {
      resolvedArray.push(await resolveReferencesToPayload(item, resolver, currentDomain));
    }
    return resolvedArray;
  }

  // Check if this object has a ref property
  if (obj.ref && typeof obj.ref === 'string') {
    try {
      console.log(chalk.gray(`    🔗 Resolving ref: ${obj.ref}`));
      
      // Resolve the reference to get the full component
      const resolvedComponent = await resolver.resolveRef(obj.ref, currentDomain);
      
      // Extract the payload (key, version, domain, flow)
      const payload = {
        key: resolvedComponent.key,
        version: resolvedComponent.version,
        domain: resolvedComponent.domain,
        flow: resolvedComponent.flow
      };
      
      console.log(chalk.green(`    ✅ Resolved to payload: ${payload.key}@${payload.version} (${payload.domain})`));
      
      return payload;
      
    } catch (error) {
      console.log(chalk.red(`    ❌ Failed to resolve ref: ${obj.ref} - ${error.message}`));
      // Return original ref if resolution fails
      return obj;
    }
  }

  // Recursively process all properties
  const resolvedObj = {};
  for (const [key, value] of Object.entries(obj)) {
    resolvedObj[key] = await resolveReferencesToPayload(value, resolver, currentDomain);
  }

  return resolvedObj;
}

/**
 * Builds package with validation and reference resolution
 * @param {string} outputDir - Output directory
 * @param {string} type - Build type (reference or runtime)
 * @returns {Promise<void>}
 */
async function buildPackage(outputDir, type = 'reference') {
  const configPath = path.join(process.cwd(), 'amorphie.config.json');
  if (!(await fs.pathExists(configPath))) {
    throw new Error('amorphie.config.json not found');
  }

  const config = await fs.readJSON(configPath);
  
  // Run validation
  const resolver = new RefResolver({
    strictMode: config.referenceResolution?.strictMode,
    validateReferenceConsistency: config.referenceResolution?.validateReferenceConsistency !== false,
    validateSchemas: config.referenceResolution?.validateSchemas !== false,
    schemaPath: path.join(__dirname, 'template', '.vscode', 'schemas')
  });
  
  await resolver.loadValidationConfig(configPath);
  
  const scanPath = path.join(process.cwd(), config.paths?.componentsRoot || config.domain);
  const jsonFiles = await findJsonFiles(scanPath);
  
  // Validate all files
  for (const filePath of jsonFiles) {
    const content = await fs.readJSON(filePath);
    const validation = await resolver.validateAllReferences(content, config.domain);
    
    if (!validation.valid) {
      throw new Error(`Validation failed for ${path.relative(process.cwd(), filePath)}`);
    }
  }
  
  // Clean and prepare output
  const fullOutputDir = path.join(process.cwd(), outputDir);
  await fs.remove(fullOutputDir);
  await fs.ensureDir(fullOutputDir);
  
  // Copy configuration
  await fs.writeJSON(path.join(fullOutputDir, 'amorphie.config.json'), config, { spaces: 2 });
  
  const packagePath = path.join(process.cwd(), 'package.json');
  if (await fs.pathExists(packagePath)) {
    const packageJson = await fs.readJSON(packagePath);
    const originalPackageName = packageJson.name;
    
    // Modify package name based on build type
    if (type === 'reference') {
      packageJson.name = `${originalPackageName}-reference`;
      packageJson.description = `${packageJson.description || ''} (Reference Package for Cross-Domain Usage)`.trim();
    } else if (type === 'runtime') {
      packageJson.name = `${originalPackageName}-runtime`;
      packageJson.description = `${packageJson.description || ''} (Runtime Package for Engine Deployment)`.trim();
    }
    
    // Add build type metadata
    packageJson.amorphie = {
      ...packageJson.amorphie,
      buildType: type,
      buildTimestamp: new Date().toISOString(),
      originalPackage: originalPackageName
    };
    
    await fs.writeJSON(path.join(fullOutputDir, 'package.json'), packageJson, { spaces: 2 });
  }
  
  // Process components based on type
  const domainPath = path.join(process.cwd(), config.paths?.componentsRoot || config.domain);
  
  if (type === 'reference') {
    // Reference build: only exported components with reference resolution
    if (config.exports) {
      for (const [category, files] of Object.entries(config.exports)) {
        if (Array.isArray(files)) {
          const categoryPath = config.paths[category] || category;
          
          for (const filename of files) {
            const sourcePath = path.join(domainPath, categoryPath, filename);
            const targetPath = path.join(fullOutputDir, config.domain, categoryPath, filename);
            
            if (await fs.pathExists(sourcePath)) {
              await fs.ensureDir(path.dirname(targetPath));
              
              const originalContent = await fs.readJSON(sourcePath);
              const processedContent = await resolveReferencesToPayload(originalContent, resolver, config.domain);
              
              await fs.writeJSON(targetPath, processedContent, { spaces: 2 });
            }
          }
        }
      }
    }
  } else if (type === 'runtime') {
    // Runtime build: complete domain structure with reference resolution
    console.log(chalk.blue(`🔧 Processing runtime build for domain: ${config.domain}`));
    const targetDomainPath = path.join(fullOutputDir, config.domain);
    
    if (await fs.pathExists(domainPath)) {
      console.log(chalk.gray(`📁 Source domain path: ${domainPath}`));
      console.log(chalk.gray(`📁 Target domain path: ${targetDomainPath}`));
      
      // Get all files recursively
      const allFiles = await getAllFiles(domainPath);
      console.log(chalk.gray(`📄 Found ${allFiles.length} files to process`));
      
      for (const filePath of allFiles) {
        const targetPath = path.join(targetDomainPath, path.relative(domainPath, filePath));
        await fs.ensureDir(path.dirname(targetPath));
        
        const relativePath = path.relative(domainPath, filePath);
        
        // Process JSON files with reference resolution
        if (path.extname(filePath) === '.json') {
          try {
            console.log(chalk.gray(`🔄 Processing JSON: ${relativePath}`));
            const originalContent = await fs.readJSON(filePath);
            const processedContent = await resolveReferencesToPayload(originalContent, resolver, config.domain);
            await fs.writeJSON(targetPath, processedContent, { spaces: 2 });
            console.log(chalk.green(`✅ Processed: ${relativePath}`));
          } catch (error) {
            console.log(chalk.yellow(`⚠️  JSON processing failed for ${relativePath}, copying as-is: ${error.message}`));
            // If JSON processing fails, copy as-is
            await fs.copy(filePath, targetPath);
          }
        } else {
          // Copy non-JSON files as-is
          console.log(chalk.gray(`📄 Copying non-JSON: ${relativePath}`));
          await fs.copy(filePath, targetPath);
        }
      }
    } else {
      console.log(chalk.red(`❌ Domain path not found: ${domainPath}`));
    }
  }
}

program.parse(process.argv); 