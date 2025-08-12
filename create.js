#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const RefResolver = require('./lib/ref-resolver');
const TemplateManager = require('./lib/template-manager');
const SchemaManager = require('./lib/schema-manager');
const packageJson = require('./package.json');

program
  .name('vnext')
  .description(packageJson.description)
  .version(packageJson.version);

// Create command (existing functionality)
program
  .command('create [project-name]')
  .description('Create a new vNext domain project')
  .option('-v, --version <version>', 'Template version to use (latest, v1.0.0, etc.)', 'latest')
  .option('--list-versions', 'List available template versions and exit')
  .option('--refresh-template', 'Force refresh template cache')
  .action(async (projectName, options) => {
    try {
      // Initialize template manager
      const templateManager = new TemplateManager();
      
      // List versions and exit if requested
      if (options.listVersions) {
        console.log(chalk.blue('📋 Available template versions:'));
        try {
          const versions = await templateManager.listAvailableVersions();
          if (versions.length === 0) {
            console.log(chalk.gray('  No versions found'));
          } else {
            versions.forEach((version, index) => {
              const marker = index === 0 ? chalk.green(' (latest)') : '';
              console.log(`  ${version}${marker}`);
            });
          }
        } catch (error) {
          console.log(chalk.red(`Error listing versions: ${error.message}`));
        }
        return;
      }
      
      let name = projectName;
      
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

      // Convert project name to domain name format (lowercase, hyphen-separated)
      const domainName = convertToDomainFormat(name);
      
      // Show domain conversion to user
      if (domainName !== name) {
        console.log(chalk.blue(`📝 Domain name: "${name}" → "${domainName}" (formatted for domain usage)`));
      } else {
        console.log(chalk.blue(`📝 Domain name: "${domainName}"`));
      }

      const targetPath = path.join(process.cwd(), name);
      
      // Check if directory already exists
      if (await fs.pathExists(targetPath)) {
        console.log(chalk.red(`Error: Directory ${name} already exists`));
        process.exit(1);
      }

      // Create project directory
      await fs.ensureDir(targetPath);
      
      // Force refresh template cache if requested
      if (options.refreshTemplate) {
        await templateManager.updateTemplate();
      }
      
      // Ensure template is available (download specific version if not cached)
      console.log(chalk.blue(`🔖 Using template version: ${options.version}`));
      await templateManager.ensureTemplate(options.version);
      
      // Copy template files with Git-based template
      await templateManager.copyTemplate(targetPath, name, domainName);
      
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
├── vnext.config.json
├── .cursorrules
├── README.md
└── package.json
      `);
      
      console.log(chalk.blue(`\n📋 Template Info:`));
      console.log(`Template Version: ${templateManager.currentVersion}`);
      console.log(`Repository: ${templateManager.options.templateRepo}`);
      
      console.log(chalk.yellow('\n🚀 Next steps:'));
      console.log(`  cd ${name}`);
      console.log('  npm install');
      console.log('  vnext validate --resolve-refs');
      console.log('  code .');
      
    } catch (error) {
      console.error(chalk.red('Error creating project:'), error.message);
      process.exit(1);
    }
  });

// Validate command with reference resolution
program
  .command('validate [file]')
  .description('Validate domain components and resolve references (optionally specify a single file)')
  .option('--resolve-refs', 'Resolve and validate all ref references')
  .option('--strict', 'Enable strict validation mode')
  .action(async (file, options) => {
    try {
      console.log(chalk.blue('🔍 Validating domain components...'));
      
      // Load vnext.config.json
      const configPath = path.join(process.cwd(), 'vnext.config.json');
      if (!(await fs.pathExists(configPath))) {
        console.log(chalk.red('❌ vnext.config.json not found. Run this command in an vNext domain project.'));
        process.exit(1);
      }

      const config = await fs.readJSON(configPath);
      
      // Initialize schema manager and get schema path for runtime version
      const schemaManager = new SchemaManager();
      let schemaPath;
      
      try {
        schemaPath = await schemaManager.ensureSchemasForConfig(configPath);
        console.log(chalk.green(`🔖 Using schemas from runtime version: ${schemaManager.currentVersion}`));
      } catch (error) {
        console.log(chalk.red(`❌ Failed to load runtime schemas: ${error.message}`));
        console.log(chalk.red(`❌ Schema validation requires NPM access to download schema package.`));
        console.log(chalk.yellow(`💡 Possible solutions:`));
        console.log(chalk.yellow(`   - Check your internet connection`));
        console.log(chalk.yellow(`   - Verify NPM registry access: ${schemaManager.options.npmRegistry}`));
        console.log(chalk.yellow(`   - Check schema package exists: ${schemaManager.options.schemaPackageName}`));
        console.log(chalk.yellow(`   - Ensure write permissions to cache directory: ${schemaManager.schemaCacheDir}`));
        process.exit(1);
      }
      
      // Create resolver with config-based options and dynamic schema path
      const resolver = new RefResolver({
        strictMode: options.strict || config.referenceResolution?.strictMode,
        validateReferenceConsistency: config.referenceResolution?.validateReferenceConsistency !== false,
        validateSchemas: config.referenceResolution?.validateSchemas !== false,
        schemaPath: schemaPath
      });
      
      // Load additional config
      await resolver.loadValidationConfig(configPath);

      let totalFiles = 0;
      let validFiles = 0;
      let totalRefs = 0;
      let validRefs = 0;
      let schemaValidationPassed = 0;
      let schemaValidationFailed = 0;

      let jsonFiles = [];
      
      if (file) {
        // Single file validation
        const filePath = path.resolve(process.cwd(), file);
        if (!(await fs.pathExists(filePath))) {
          console.log(chalk.red(`❌ File not found: ${file}`));
          process.exit(1);
        }
        
        if (path.extname(filePath) !== '.json') {
          console.log(chalk.red(`❌ Only JSON files are supported for validation`));
          process.exit(1);
        }
        
        jsonFiles = [filePath];
        console.log(chalk.blue(`🔍 Validating single file: ${file}`));
      } else {
        // Scan all JSON files
        const scanPath = path.join(process.cwd(), config.paths?.componentsRoot || config.domain);
        jsonFiles = await findJsonFiles(scanPath);
        console.log(chalk.blue(`🔍 Validating all components in ${config.domain}...`));
      }

      for (const filePath of jsonFiles) {
        totalFiles++;
        
        try {
          const content = await fs.readJSON(filePath);
          console.log(chalk.gray(`📄 Validating: ${path.relative(process.cwd(), filePath)}`));
          
          // Always perform schema validation
          let fileSchemaValid = true;
          try {
            await resolver.validateComponentSchema(content, path.relative(process.cwd(), filePath));
            console.log(chalk.green(`  ✅ Schema validation passed`));
            schemaValidationPassed++;
          } catch (error) {
            fileSchemaValid = false;
            console.log(chalk.red(`  ❌ Schema validation failed: ${error.message}`));
            schemaValidationFailed++;
          }
          
          // Perform reference resolution if requested
          if (options.resolveRefs) {
            const validation = await resolver.validateAllReferences(content, config.domain);
            
            totalRefs += validation.resolvedRefs.length;
            validRefs += validation.resolvedRefs.filter(r => r.status === 'success').length;
            
            if (validation.valid && fileSchemaValid) {
              validFiles++;
              console.log(chalk.green(`  ✅ Complete validation passed (${validation.validationDetails.successful}/${validation.validationDetails.total} refs resolved)`));
              
              // Show detailed validation info in verbose mode
              if (validation.validationDetails.total > 0) {
                validation.resolvedRefs.forEach(ref => {
                  if (ref.status === 'success' && ref.details) {
                    console.log(chalk.gray(`    📄 ${ref.details.componentType}: ${ref.details.key}@${ref.details.version} (${ref.details.domain})`));
                  }
                });
              }
            } else {
              if (!validation.valid) {
                console.log(chalk.red(`  ❌ Reference validation failed (${validation.validationDetails.failed}/${validation.validationDetails.total} refs failed):`));
                validation.errors.forEach(error => {
                  console.log(chalk.red(`    - ${error.ref}:`));
                  console.log(chalk.red(`      ${error.error}`));
                });
              }
            }
          } else {
            if (fileSchemaValid) {
              validFiles++;
            }
          }
        } catch (error) {
          console.log(chalk.red(`  ❌ Error: ${error.message}`));
        }
      }

      console.log(chalk.blue('\n📊 Validation Summary:'));
      console.log(`Files: ${validFiles}/${totalFiles} valid`);
      console.log(`Schema Validation: ${schemaValidationPassed}/${schemaValidationPassed + schemaValidationFailed} passed`);
      if (options.resolveRefs) {
        console.log(`References: ${validRefs}/${totalRefs} resolved`);
      }
      
      const allValidationsPassed = validFiles === totalFiles && 
                                   schemaValidationFailed === 0 && 
                                   (options.resolveRefs ? validRefs === totalRefs : true);
      
      if (allValidationsPassed) {
        console.log(chalk.green('🎉 All validations passed!'));
      } else {
        console.log(chalk.yellow('⚠️  Some validations failed. Check the output above.'));
        if (schemaValidationFailed > 0) {
          console.log(chalk.red(`❌ ${schemaValidationFailed} files failed schema validation`));
        }
        if (options.resolveRefs && validRefs < totalRefs) {
          console.log(chalk.red(`❌ ${totalRefs - validRefs} references failed to resolve`));
        }
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
      
      const configPath = path.join(process.cwd(), 'vnext.config.json');
      if (!(await fs.pathExists(configPath))) {
        console.log(chalk.red('❌ vnext.config.json not found.'));
        process.exit(1);
      }

      const config = await fs.readJSON(configPath);
      const outputDir = path.join(process.cwd(), options.output);
      
      // Step 1: Validation (unless skipped)
      if (!options.skipValidation) {
        console.log(chalk.blue('\n📋 Step 1: Validating components...'));
        
        // Initialize schema manager and get schema path for runtime version
        const schemaManager = new SchemaManager();
        let schemaPath;
        
        try {
          schemaPath = await schemaManager.ensureSchemasForConfig(configPath);
          console.log(chalk.green(`🔖 Using schemas from runtime version: ${schemaManager.currentVersion}`));
        } catch (error) {
          console.log(chalk.red(`❌ Failed to load runtime schemas: ${error.message}`));
          console.log(chalk.red(`❌ Build process requires NPM access to download schema package.`));
          console.log(chalk.yellow(`💡 Possible solutions:`));
          console.log(chalk.yellow(`   - Check your internet connection`));
          console.log(chalk.yellow(`   - Verify NPM registry access: ${schemaManager.options.npmRegistry}`));
          console.log(chalk.yellow(`   - Check schema package exists: ${schemaManager.options.schemaPackageName}`));
          console.log(chalk.yellow(`   - Ensure write permissions to cache directory: ${schemaManager.schemaCacheDir}`));
          process.exit(1);
        }
        
        const resolver = new RefResolver({
          strictMode: config.referenceResolution?.strictMode,
          validateReferenceConsistency: config.referenceResolution?.validateReferenceConsistency !== false,
          validateSchemas: config.referenceResolution?.validateSchemas !== false,
          schemaPath: schemaPath
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
      await fs.writeJSON(path.join(outputDir, 'vnext.config.json'), config, { spaces: 2 });
      
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
        packageJson.vnext = {
          ...packageJson.vnext,
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
        
        // Initialize schema manager for reference resolution
        const schemaManager = new SchemaManager();
        let schemaPath;
        
        try {
          schemaPath = await schemaManager.ensureSchemasForConfig(configPath);
        } catch (error) {
          console.log(chalk.red(`❌ Failed to load runtime schemas: ${error.message}`));
          console.log(chalk.red(`❌ Reference build requires NPM access to download schema package.`));
          process.exit(1);
        }
        
        const resolver = new RefResolver({
          schemaPath: schemaPath
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
        
        // Initialize schema manager for runtime resolution
        const schemaManager = new SchemaManager();
        let schemaPath;
        
        try {
          schemaPath = await schemaManager.ensureSchemasForConfig(configPath);
        } catch (error) {
          console.log(chalk.red(`❌ Failed to load runtime schemas: ${error.message}`));
          console.log(chalk.red(`❌ Runtime build requires NPM access to download schema package.`));
          process.exit(1);
        }
        
        const resolver = new RefResolver({
          schemaPath: schemaPath
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
        
        const configPath = path.join(process.cwd(), 'vnext.config.json');
        if (!(await fs.pathExists(configPath))) {
          console.log(chalk.red('❌ vnext.config.json not found.'));
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

// Template management commands
program
  .command('template-info')
  .description('Show template information and status')
  .option('-v, --version <version>', 'Template version to check (default: latest)', 'latest')
  .action(async (options) => {
    try {
      const templateManager = new TemplateManager();
      
      console.log(chalk.blue('📋 Template Information:'));
      
      const info = await templateManager.getTemplateInfo(options.version);
      
      console.log(`Repository: ${info.repository}`);
      console.log(`Current Version: ${info.version}`);
      console.log(`Cache Path: ${info.path}`);
      console.log(`Cached: ${info.exists ? chalk.green('Yes') : chalk.red('No')}`);
      
      if (info.availableVersions.length > 0) {
        console.log(chalk.blue('\n🏷️  Available Versions:'));
        info.availableVersions.forEach((version, index) => {
          const marker = index === 0 ? chalk.green(' (latest)') : '';
          const current = version === info.version ? chalk.yellow(' (current)') : '';
          console.log(`  ${version}${marker}${current}`);
        });
      }
      
      if (info.config) {
        console.log(chalk.blue('\n📦 Template Config:'));
        console.log(`Version: ${info.config.version}`);
        console.log(`Description: ${info.config.description}`);
        console.log(`Domain: ${info.config.domain}`);
      }
      
      if (info.packageJson) {
        console.log(chalk.blue('\n📄 Package Info:'));
        console.log(`Name: ${info.packageJson.name}`);
        console.log(`Version: ${info.packageJson.version}`);
      }
      
    } catch (error) {
      console.error(chalk.red('Error getting template info:'), error.message);
      process.exit(1);
    }
  });

program
  .command('template-update')
  .description('Update template cache (clear all cached versions)')
  .action(async () => {
    try {
      const templateManager = new TemplateManager();
      
      console.log(chalk.blue('🔄 Updating template cache...'));
      await templateManager.updateTemplate();
      console.log(chalk.green('✅ Template cache updated successfully'));
      
    } catch (error) {
      console.error(chalk.red('Error updating template:'), error.message);
      process.exit(1);
    }
  });

program
  .command('template-versions')
  .description('List all available template versions')
  .action(async () => {
    try {
      const templateManager = new TemplateManager();
      
      console.log(chalk.blue('📋 Available template versions:'));
      const versions = await templateManager.listAvailableVersions();
      
      if (versions.length === 0) {
        console.log(chalk.gray('  No versions found'));
      } else {
        versions.forEach((version, index) => {
          const marker = index === 0 ? chalk.green(' (latest)') : '';
          console.log(`  ${version}${marker}`);
        });
      }
      
    } catch (error) {
      console.error(chalk.red('Error listing versions:'), error.message);
      process.exit(1);
    }
  });

program
  .command('template-clear')
  .description('Clear template cache')
  .action(async () => {
    try {
      const templateManager = new TemplateManager();
      await templateManager.clearCache();
      
    } catch (error) {
      console.error(chalk.red('Error clearing template cache:'), error.message);
      process.exit(1);
    }
  });

// Schema management commands
program
  .command('schema-info')
  .description('Show schema package information and status')
  .option('-v, --version <version>', 'Schema version to check (default: latest)', 'latest')
  .action(async (options) => {
    try {
      const schemaManager = new SchemaManager();
      
      console.log(chalk.blue('📋 Schema Package Information:'));
      
      const info = await schemaManager.getSchemaInfo(options.version);
      
      console.log(`Package: ${info.packageName}`);
      console.log(`Current Version: ${info.version}`);
      console.log(`Cache Path: ${info.path}`);
      console.log(`Cached: ${info.exists ? chalk.green('Yes') : chalk.red('No')}`);
      
      if (info.availableVersions.length > 0) {
        console.log(chalk.blue('\n🏷️  Available Versions:'));
        info.availableVersions.slice(0, 10).forEach((version, index) => {
          const marker = index === 0 ? chalk.green(' (latest)') : '';
          const current = version === info.version ? chalk.yellow(' (current)') : '';
          console.log(`  ${version}${marker}${current}`);
        });
        
        if (info.availableVersions.length > 10) {
          console.log(chalk.gray(`  ... and ${info.availableVersions.length - 10} more versions`));
        }
      }
      
      if (info.packageJson) {
        console.log(chalk.blue('\n📄 Package Info:'));
        console.log(`Name: ${info.packageJson.name}`);
        console.log(`Version: ${info.packageJson.version}`);
        console.log(`Description: ${info.packageJson.description || 'No description'}`);
      }
      
      if (info.schemaFiles && info.schemaFiles.length > 0) {
        console.log(chalk.blue('\n📄 Schema Files:'));
        info.schemaFiles.forEach(file => {
          console.log(`  ${file}`);
        });
      }
      
    } catch (error) {
      console.error(chalk.red('Error getting schema info:'), error.message);
      process.exit(1);
    }
  });

program
  .command('schema-update')
  .description('Update schema cache (clear all cached versions)')
  .action(async () => {
    try {
      const schemaManager = new SchemaManager();
      
      console.log(chalk.blue('🔄 Updating schema cache...'));
      await schemaManager.updateSchemas();
      console.log(chalk.green('✅ Schema cache updated successfully'));
      
    } catch (error) {
      console.error(chalk.red('Error updating schema cache:'), error.message);
      process.exit(1);
    }
  });

program
  .command('schema-versions')
  .description('List all available schema package versions')
  .action(async () => {
    try {
      const schemaManager = new SchemaManager();
      
      console.log(chalk.blue('📋 Available schema package versions:'));
      const versions = await schemaManager.listAvailableVersions();
      
      if (versions.length === 0) {
        console.log(chalk.gray('  No versions found'));
      } else {
        versions.slice(0, 20).forEach((version, index) => {
          const marker = index === 0 ? chalk.green(' (latest)') : '';
          console.log(`  ${version}${marker}`);
        });
        
        if (versions.length > 20) {
          console.log(chalk.gray(`  ... and ${versions.length - 20} more versions`));
        }
      }
      
    } catch (error) {
      console.error(chalk.red('Error listing schema versions:'), error.message);
      process.exit(1);
    }
  });

program
  .command('schema-clear')
  .description('Clear schema cache')
  .action(async () => {
    try {
      const schemaManager = new SchemaManager();
      await schemaManager.clearCache();
      
    } catch (error) {
      console.error(chalk.red('Error clearing schema cache:'), error.message);
      process.exit(1);
    }
  });

// Visualize boundaries command
program
  .command('visualize-boundaries [file]')
  .description('Generate domain boundary visualization (optionally specify a single file)')
  .option('-f, --format <format>', 'Output format (json, mermaid, dot)', 'json')
  .option('-o, --output <file>', 'Output file path')
  .action(async (file, options) => {
    try {
      console.log(chalk.blue('🗺️  Generating domain boundary visualization...'));
      
      const configPath = path.join(process.cwd(), 'vnext.config.json');
      if (!(await fs.pathExists(configPath))) {
        console.log(chalk.red('❌ vnext.config.json not found.'));
        process.exit(1);
      }

      const config = await fs.readJSON(configPath);
      const resolver = new RefResolver();
      
      let jsonFiles = [];
      let isGlobal = !file;
      
      if (file) {
        // Single file visualization
        const filePath = path.resolve(process.cwd(), file);
        if (!(await fs.pathExists(filePath))) {
          console.log(chalk.red(`❌ File not found: ${file}`));
          process.exit(1);
        }
        
        if (path.extname(filePath) !== '.json') {
          console.log(chalk.red(`❌ Only JSON files are supported for visualization`));
          process.exit(1);
        }
        
        jsonFiles = [filePath];
        console.log(chalk.blue(`🗺️  Visualizing boundaries for single file: ${file}`));
      } else {
        // Scan all JSON files for references
        const scanPath = path.join(process.cwd(), config.paths?.componentsRoot || config.domain);
        jsonFiles = await findJsonFiles(scanPath);
        console.log(chalk.blue(`🗺️  Visualizing boundaries for all components in ${config.domain}...`));
      }
      
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
          const scanPath = isGlobal ? 
            path.join(process.cwd(), config.paths?.componentsRoot || config.domain) :
            path.dirname(filePath);
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
        // Auto-generate output file name and path
        let outputFile = '';
        
        if (isGlobal) {
          // Global mode: use domain name
          outputFile = `${config.domain}.${options.format}`;
        } else {
          // Single file mode: use file name + "-visualize" suffix
          const inputFile = path.resolve(process.cwd(), file);
          const inputDir = path.dirname(inputFile);
          const inputName = path.basename(inputFile, '.json');
          outputFile = path.join(inputDir, `${inputName}-visualize.${options.format}`);
        }
        
        await fs.writeFile(outputFile, output);
        console.log(chalk.green(`✅ Visualization saved to ${outputFile}`));
      }

      console.log(chalk.blue(`\n📊 Boundary Analysis:`));
      if (isGlobal) {
        console.log(`Components: ${boundaries.components.length}`);
        console.log(`References: ${boundaries.references.length}`);
        console.log(`External Dependencies: ${boundaries.dependencies.length}`);
      } else {
        console.log(`Component: ${boundaries.components[0]?.key || 'Unknown'}`);
        console.log(`Type: ${boundaries.components[0]?.type || 'Unknown'}`);
        console.log(`References: ${boundaries.references.length}`);
        console.log(`External Dependencies: ${boundaries.dependencies.length}`);
      }

    } catch (error) {
      console.error(chalk.red('Visualization error:'), error.message);
      process.exit(1);
    }
  });

// Helper functions (existing and new)

/**
 * Convert project name to domain format
 * @param {string} projectName - Original project name
 * @returns {string} Domain-formatted name
 */
function convertToDomainFormat(projectName) {
  return projectName
    .trim()
    .toLowerCase()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Remove non-alphanumeric characters except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Remove multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '');
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
  const configPath = path.join(process.cwd(), 'vnext.config.json');
  if (!(await fs.pathExists(configPath))) {
    throw new Error('vnext.config.json not found');
  }

  const config = await fs.readJSON(configPath);
  
  // Run validation with runtime-specific schemas
  const schemaManager = new SchemaManager();
  let schemaPath;
  
  try {
    schemaPath = await schemaManager.ensureSchemasForConfig(configPath);
  } catch (error) {
    throw new Error(`Schema validation failed: ${error.message}. NPM access required to download schema package.`);
  }
  
  const resolver = new RefResolver({
    strictMode: config.referenceResolution?.strictMode,
    validateReferenceConsistency: config.referenceResolution?.validateReferenceConsistency !== false,
    validateSchemas: config.referenceResolution?.validateSchemas !== false,
    schemaPath: schemaPath
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
  await fs.writeJSON(path.join(fullOutputDir, 'vnext.config.json'), config, { spaces: 2 });
  
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
    packageJson.vnext = {
      ...packageJson.vnext,
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