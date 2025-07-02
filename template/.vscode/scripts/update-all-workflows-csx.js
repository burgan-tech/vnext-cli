#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Updates all {domainName} domain component JSON files by encoding CSX rule files to base64
 * Usage: node update-all-workflows-csx.js [domainName]
 */

function findComponentFiles(baseDir) {
    const componentFiles = [];
    
    function scanDirectory(dirPath) {
        try {
            const items = fs.readdirSync(dirPath, { withFileTypes: true });
            
            items.forEach(item => {
                if (item.isDirectory()) {
                    const fullPath = path.join(dirPath, item.name);
                    
                    // Check if this directory has JSON files and src directory
                    try {
                        const dirContents = fs.readdirSync(fullPath);
                        const jsonFiles = dirContents
                            .filter(file => file.endsWith('.json'))
                            .map(file => path.join(fullPath, file));
                        const hasSrcDir = fs.existsSync(path.join(fullPath, 'src'));
                        
                        if (jsonFiles.length > 0 && hasSrcDir) {
                            // Add each JSON file as a separate component
                            jsonFiles.forEach(jsonFile => {
                                componentFiles.push({
                                    jsonFile: jsonFile,
                                    directory: fullPath
                                });
                            });
                        }
                    } catch (error) {
                        // Skip directories we can't read
                    }
                    
                    // Recursively scan subdirectories (max depth 3 to avoid infinite loops)
                    const depth = fullPath.split(path.sep).length - baseDir.split(path.sep).length;
                    if (depth < 3) {
                        scanDirectory(fullPath);
                    }
                }
            });
        } catch (error) {
            console.warn(`⚠️  Cannot scan directory ${dirPath}: ${error.message}`);
        }
    }
    
    scanDirectory(baseDir);
    return componentFiles;
}

function updateComponent(component) {
    const updateScript = path.join(__dirname, 'update-workflow-csx.js');
    const workspaceRoot = path.resolve(__dirname, '../..');
    
    try {
        const jsonFileName = path.basename(component.jsonFile);
        const relativeDir = path.relative(workspaceRoot, component.directory);
        console.log(`\n🔄 Updating: ${relativeDir}/${jsonFileName}`);
        
        // Pass directory and filename separately as update-workflow-csx.js expects
        const output = execSync(`node "${updateScript}" "${component.directory}" "${jsonFileName}"`, { 
            encoding: 'utf-8',
            cwd: workspaceRoot 
        });
        
        // Show success message
        const lines = output.split('\n');
        const successLine = lines.find(line => line.includes('Successfully updated') || line.includes('No CSX rules found'));
        if (successLine) {
            console.log(`  ${successLine.replace(/^[✅⚠️]\s*/, '')}`);
        } else {
            console.log('  ✅ Component processed');
        }
    } catch (error) {
        console.error(`  ❌ Error updating component: ${error.message}`);
    }
}

// Main execution
const args = process.argv.slice(2);
const workspaceRoot = path.resolve(__dirname, '../..');
const domainName = args[0] || '{domainName}';

console.log(`🚀 Update All {domainName} Domain Components`);
console.log('=' .repeat(50));

// Look for component directories in the domain
const domainDir = path.join(workspaceRoot, domainName);

if (!fs.existsSync(domainDir)) {
    console.error(`❌ {domainName} domain directory not found: ${domainDir}`);
    process.exit(1);
}

console.log(`🔍 Scanning {domainName} domain for component files...`);
const componentFiles = findComponentFiles(domainDir);

if (componentFiles.length === 0) {
    console.log(`⚠️  No component files found in {domainName} domain`);
    console.log(`\nTo create a component directory, add:`);
    console.log(`- A JSON file (any component type)`);
    console.log(`- A 'src' directory with .csx files`);
    process.exit(0);
}

console.log(`📁 Found ${componentFiles.length} component files in {domainName} domain:`);
componentFiles.forEach((component, index) => {
    const relativeDir = path.relative(workspaceRoot, component.directory);
    const jsonFileName = path.basename(component.jsonFile);
    console.log(`${index + 1}. ${relativeDir}/${jsonFileName}`);
});

console.log('\n🔄 Starting batch update...');

// Update all components
let successCount = 0;
let errorCount = 0;

componentFiles.forEach(component => {
    try {
        updateComponent(component);
        successCount++;
    } catch (error) {
        const relativeDir = path.relative(workspaceRoot, component.directory);
        const jsonFileName = path.basename(component.jsonFile);
        console.error(`❌ Failed to update ${relativeDir}/${jsonFileName}:`, error.message);
        errorCount++;
    }
});

console.log('\n📊 Update Summary:');
console.log(`✅ Successfully updated: ${successCount} components`);
if (errorCount > 0) {
    console.log(`❌ Failed to update: ${errorCount} components`);
}

console.log(`\n🎉 {domainName} domain component batch update completed!`);

if (errorCount > 0) {
    process.exit(1);
} 