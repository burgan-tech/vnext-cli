#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');

program
  .name('create-amorphie-app')
  .description('CLI to create Amorphie template projects')
  .version('1.0.0');

program
  .argument('[project-name]', 'project name')
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
      console.log('  code .');
      
    } catch (error) {
      console.error(chalk.red('Error creating project:'), error.message);
      process.exit(1);
    }
  });

async function copyTemplate(templatePath, targetPath, projectName, domainName) {
  const items = await fs.readdir(templatePath);
  
  // Debug: Log all items found
  console.log('📂 Files found in template:', items);
  console.log('🔍 Hidden files:', items.filter(item => item.startsWith('.')));
  
  for (const item of items) {
    const sourcePath = path.join(templatePath, item);
    const stat = await fs.stat(sourcePath);
    
    if (stat.isDirectory()) {
      if (item === '{domainName}') {
        // Replace {domainName} with actual domain name
        const actualTargetPath = path.join(targetPath, domainName);
        await copyDirectoryRecursive(sourcePath, actualTargetPath, projectName, domainName);
      } else {
        // Copy directory recursively with placeholder replacement
        const targetItemPath = path.join(targetPath, item);
        await copyDirectoryRecursive(sourcePath, targetItemPath, projectName, domainName);
      }
    } else {
      // Copy file and replace placeholders
      const targetItemPath = path.join(targetPath, item);
      console.log(`📄 Copying file: ${item}`);
      await copyFileWithPlaceholders(sourcePath, targetItemPath, projectName, domainName);
    }
  }
  
  // Ensure critical hidden files are copied (double-check)
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
  
  // For binary files or files that shouldn't be processed, copy directly
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.otf', '.exe', '.dll', '.so', '.dylib'];
  
  if (binaryExtensions.includes(extname.toLowerCase())) {
    await fs.copy(sourcePath, targetPath);
    return;
  }
  
  try {
    // Read file content and replace placeholders
    let content = await fs.readFile(sourcePath, 'utf8');
    content = content.replace(/{packageName}/g, projectName);
    content = content.replace(/{domainName}/g, domainName);
    await fs.writeFile(targetPath, content);
  } catch (error) {
    // If file can't be read as text, copy as binary
    await fs.copy(sourcePath, targetPath);
  }
}

program.parse(process.argv); 