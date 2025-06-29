#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Watches {domainName} domain CSX files and automatically updates component JSON files
 * Usage: node watch-workflows-csx.js [domainName]
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
                    
                    // Recursively scan subdirectories (max depth 3)
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
        
        // Show only the success message
        const successMatch = output.match(/✅ Successfully updated \d+ rules in .+/);
        if (successMatch) {
            console.log(`  ${successMatch[0]}`);
        } else {
            console.log('  ⚠️  No changes detected');
        }
    } catch (error) {
        console.error(`  ❌ Error updating component: ${error.message}`);
    }
}

// Main execution
const args = process.argv.slice(2);
const workspaceRoot = path.resolve(__dirname, '../..');
const domainName = args[0] || '{domainName}';
const domainDir = path.join(workspaceRoot, domainName);

console.log(`👀 {domainName} Domain Component Watcher`);
console.log('=' .repeat(50));
console.log('Watching for CSX file changes...');
console.log('Press Ctrl+C to stop');
console.log('=' .repeat(50));

if (!fs.existsSync(domainDir)) {
    console.error(`❌ {domainName} domain directory not found: ${domainDir}`);
    process.exit(1);
}

const componentDirs = findComponentDirectories(domainDir);

if (componentDirs.length === 0) {
    console.log(`⚠️  No component directories found in {domainName} domain`);
    console.log(`\nTo create a component directory, add:`);
    console.log(`- A JSON file (any component type)`);
    console.log(`- A 'src' directory with .csx files`);
    process.exit(0);
}

console.log(`📁 Found ${componentDirs.length} component directories to watch in {domainName} domain:`);
componentDirs.forEach((dir, index) => {
    console.log(`${index + 1}. ${path.relative(workspaceRoot, dir)}`);
});

// Set up file watchers
const watchers = [];
const debounceMap = new Map();

componentDirs.forEach(componentDir => {
    const srcDir = path.join(componentDir, 'src');
    
    if (fs.existsSync(srcDir)) {
        try {
            const watcher = fs.watch(srcDir, { recursive: false }, (eventType, filename) => {
                if (filename && filename.endsWith('.csx')) {
                    console.log(`\n📝 Detected change in {domainName}: ${filename} (${eventType})`);
                    
                    // Debounce rapid changes
                    const key = `${componentDir}:${filename}`;
                    if (debounceMap.has(key)) {
                        clearTimeout(debounceMap.get(key));
                    }
                    
                    debounceMap.set(key, setTimeout(() => {
                        updateComponent(componentDir);
                        debounceMap.delete(key);
                    }, 500));
                }
            });
            
            watchers.push(watcher);
            console.log(`👁️  Watching: ${path.relative(workspaceRoot, srcDir)}`);
        } catch (error) {
            console.error(`❌ Failed to watch ${srcDir}: ${error.message}`);
        }
    }
});

if (watchers.length === 0) {
    console.error(`❌ No directories could be watched`);
    process.exit(1);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Stopping {domainName} domain file watchers...');
    watchers.forEach(watcher => {
        try {
            watcher.close();
        } catch (error) {
            // Ignore errors when closing watchers
        }
    });
    console.log('✅ {domainName} domain watchers stopped');
    process.exit(0);
});

// Keep the process alive
console.log(`\n✅ {domainName} domain file watchers are active. Modify any .csx file to see automatic updates.`);
console.log(`\n💡 Tip: Use the following tasks in VS Code:`);
console.log(`   - "Update Current {domainName} CSX" (current file)`);
console.log(`   - "Update All {domainName} CSX" (all components)`);
console.log(`   - "Create Mapping CSX" (new mapping file)`);
console.log(`   - "Create Rule CSX" (new rule file)`);

setInterval(() => {
    // Keep alive
}, 1000); 