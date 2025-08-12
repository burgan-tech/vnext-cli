#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

async function testCLI() {
  console.log('🚀 Testing vNext CLI...');
  
  const projectName = 'test-banking-project';
  const domainName = 'customer-management';
  const targetPath = path.join(__dirname, '..', 'cli-test', projectName);
  
  try {
    // Check if directory already exists
    if (await fs.pathExists(targetPath)) {
      console.log(`📁 Removing existing directory: ${projectName}`);
      await fs.remove(targetPath);
    }

    // Create project directory
    await fs.ensureDir(targetPath);
    console.log(`✅ Created project directory: ${projectName}`);
    
    // Copy template files
    const templatePath = path.join(__dirname, 'template');
    console.log(`📋 Copying template from: ${templatePath}`);
    
    await copyTemplate(templatePath, targetPath, projectName, domainName);
    
    console.log(`✅ Successfully created ${projectName}`);
    console.log(`📁 Project structure created with domain: ${domainName}`);
    
    // List created files
    const files = await fs.readdir(targetPath);
    console.log('\n📄 Created files:');
    files.forEach(file => console.log(`  - ${file}`));
    
  } catch (error) {
    console.error('❌ Error testing CLI:', error.message);
  }
}

async function copyTemplate(templatePath, targetPath, projectName, domainName) {
  const items = await fs.readdir(templatePath);
  
  for (const item of items) {
    const sourcePath = path.join(templatePath, item);
    const stat = await fs.stat(sourcePath);
    
    if (stat.isDirectory()) {
      if (item === '{domainName}') {
        // Replace {domainName} with actual domain name
        const actualTargetPath = path.join(targetPath, domainName);
        await copyDirectoryRecursive(sourcePath, actualTargetPath, projectName, domainName);
        console.log(`📁 Copied domain directory: {domainName} -> ${domainName}`);
      } else {
        // Copy directory recursively with placeholder replacement
        const targetItemPath = path.join(targetPath, item);
        await copyDirectoryRecursive(sourcePath, targetItemPath, projectName, domainName);
        console.log(`📁 Copied directory: ${item}`);
      }
    } else {
      // Copy file and replace placeholders
      const targetItemPath = path.join(targetPath, item);
      await copyFileWithPlaceholders(sourcePath, targetItemPath, projectName, domainName);
      console.log(`📄 Processed file: ${item}`);
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

// Run test
testCLI(); 