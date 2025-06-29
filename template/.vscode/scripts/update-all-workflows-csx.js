#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Updates all {domainName} domain component JSON files by encoding CSX rule files to base64
 * Usage: node update-all-workflows-csx.js [domainName]
 */

function findComponentDirectories(baseDir) {
    const componentDirs = [];
    
    function scanDirectory(dirPath) {
        try {
            const items = fs.readdirSync(dirPath, { withFileTypes: true });
            
            items.forEach(item => {
                if (item.isDirectory()) {
                    const fullPath = path.join(dirPath, item.name);
                    
                    // Check if this directory has a JSON file and src directory
                    try {
                        const dirContents = fs.readdirSync(fullPath);
                        const hasJson = dirContents
                            .some(file => file.endsWith('.json'));
                        const hasSrcDir = fs.existsSync(path.join(fullPath, 'src'));
                        
                        if (hasJson && hasSrcDir) {
                            componentDirs.push(fullPath);
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
    return componentDirs;
}

function updateComponent(componentDir) {
    const updateScript = path.join(__dirname, 'update-workflow-csx.js');
    const workspaceRoot = path.resolve(__dirname, '../..');
    
    try {
        console.log(`\n🔄 Updating: ${path.relative(workspaceRoot, componentDir)}`);
        const output = execSync(`node "${updateScript}" "${componentDir}"`, { 
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

console.log(`🔍 Scanning {domainName} domain for component directories...`);
const componentDirs = findComponentDirectories(domainDir);

if (componentDirs.length === 0) {
    console.log(`⚠️  No component directories found in {domainName} domain`);
    console.log(`\nTo create a component directory, add:`);
    console.log(`- A JSON file (any component type)`);
    console.log(`- A 'src' directory with .csx files`);
    process.exit(0);
}

console.log(`📁 Found ${componentDirs.length} component directories in {domainName} domain:`);
componentDirs.forEach((dir, index) => {
    console.log(`${index + 1}. ${path.relative(workspaceRoot, dir)}`);
});

console.log('\n🔄 Starting batch update...');

// Update all components
let successCount = 0;
let errorCount = 0;

componentDirs.forEach(componentDir => {
    try {
        updateComponent(componentDir);
        successCount++;
    } catch (error) {
        console.error(`❌ Failed to update ${componentDir}:`, error.message);
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