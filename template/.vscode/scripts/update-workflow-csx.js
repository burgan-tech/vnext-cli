#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Updates {domainName} domain component JSON files by encoding CSX rule files to base64
 * Usage: node update-workflow-csx.js [directory] [specific-json-file]
 */

function removeLoadStatements(code) {
    // Remove #load statements and empty lines that follow
    return code
        .split('\n')
        .filter(line => !line.trim().startsWith('#load'))
        .join('\n')
        .replace(/^\n+/, ''); // Remove leading empty lines
}

function encodeToBase64(content) {
    return Buffer.from(content, 'utf-8').toString('base64');
}

function tryGetActiveWorkflowFile() {
    try {
        const activeFileScript = path.join(__dirname, 'get-active-file.js');
        const output = execSync(`node "${activeFileScript}"`, { 
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return output.trim();
    } catch (error) {
        // No active workflow file found or script failed
        return null;
    }
}

function processWorkflowDirectory(dirPath, specificFile = null) {
    console.log(`🔄 Processing {domainName} domain directory: ${dirPath}`);
    
    let targetFileName;
    
    if (specificFile) {
        // Use specific file if provided
        const specificPath = path.join(dirPath, specificFile);
        if (!fs.existsSync(specificPath)) {
            console.error(`❌ Specified workflow file not found: ${specificFile}`);
            return;
        }
        if (!specificFile.endsWith('.json')) {
            console.error(`❌ Specified file is not a JSON file: ${specificFile}`);
            return;
        }
        targetFileName = specificFile;
        console.log(`📄 Using specified JSON file: ${specificFile}`);
    } else {
        // Try to get active component file from VS Code
        const activeFile = tryGetActiveWorkflowFile();
        if (activeFile) {
            const activeFilePath = path.join(dirPath, activeFile);
            if (fs.existsSync(activeFilePath)) {
                targetFileName = activeFile;
                console.log(`📄 Using active component file: ${activeFile}`);
            } else {
                console.log(`⚠️  Active file not found in target directory: ${activeFile}`);
            }
        }
        
        if (!targetFileName) {
            // Find JSON files (existing logic)
            const jsonFiles = fs.readdirSync(dirPath).filter(file => 
                file.endsWith('.json')
            );
            
            if (jsonFiles.length === 0) {
                console.log('⚠️  No JSON file found in directory');
                return;
            }
            
            targetFileName = jsonFiles[0];
            console.log(`📄 Found JSON file: ${jsonFiles[0]}`);
            
            if (jsonFiles.length > 1) {
                console.log(`📄 Note: Multiple JSON files found, using: ${targetFileName}`);
                console.log(`📄 Other files: ${jsonFiles.slice(1).join(', ')}`);
            }
        }
    }
    
    const jsonFile = path.join(dirPath, targetFileName);
    
    // Read and parse JSON
    let workflowData;
    try {
        const jsonContent = fs.readFileSync(jsonFile, 'utf-8');
        workflowData = JSON.parse(jsonContent);
    } catch (error) {
        console.error(`❌ Error reading JSON file: ${error.message}`);
        return;
    }
    
    // Validate domain
    if (workflowData.domain !== '{domainName}') {
        console.warn(`⚠️  Warning: Component domain '${workflowData.domain}' does not match expected '{domainName}'`);
    }
    
    // Find src directory
    const srcDir = path.join(dirPath, 'src');
    if (!fs.existsSync(srcDir)) {
        console.log('⚠️  No src directory found');
        return;
    }
    
    // Get all CSX files in src directory
    const csxFiles = fs.readdirSync(srcDir).filter(file => file.endsWith('.csx'));
    console.log(`🔍 Found ${csxFiles.length} CSX files in {domainName} domain`);
    
    // Create mapping of CSX files
    const csxContentMap = {};
    csxFiles.forEach(file => {
        const filePath = path.join(srcDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const cleanContent = removeLoadStatements(content);
        const encoded = encodeToBase64(cleanContent);
        csxContentMap[`./src/${file}`] = encoded;
        console.log(`✅ Processed CSX: ${file}`);
    });
    
    // Update JSON data
    let updatesCount = 0;
    
    function updateTasksInCollection(tasks, collectionName) {
        if (!Array.isArray(tasks)) return;
        
        tasks.forEach(task => {
            if (task.rule && task.rule.location) {
                const location = task.rule.location;
                if (csxContentMap[location]) {
                    task.rule.code = csxContentMap[location];
                    updatesCount++;
                    console.log(`📝 Updated rule: ${location} in ${collectionName}`);
                }
            }
            if (task.mapping && task.mapping.location) {
                const location = task.mapping.location;
                if (csxContentMap[location]) {
                    task.mapping.code = csxContentMap[location];
                    updatesCount++;
                    console.log(`📝 Updated mapping: ${location} in ${collectionName}`);
                }
            }
        });
    }
    
    function updateRulesInStates(states) {
        if (!Array.isArray(states)) return;
        
        states.forEach(state => {
            // Update transitions
            if (state.transitions) {
                state.transitions.forEach(transition => {
                    if (transition.rule && transition.rule.location) {
                        const location = transition.rule.location;
                        if (csxContentMap[location]) {
                            transition.rule.code = csxContentMap[location];
                            updatesCount++;
                            console.log(`📝 Updated rule: ${location} in transition: ${transition.key}`);
                        }
                    }

                    if (transition.onExecutionTasks) {
                        updateTasksInCollection(transition.onExecutionTasks, `transition: ${transition.key}`);
                    }
                });
            }
            
            // Update onEntries
            if (state.onEntries) {
                updateTasksInCollection(state.onEntries, `state: ${state.key} onEntries`);
            }
            
            // Update onExits
            if (state.onExits) {
                updateTasksInCollection(state.onExits, `state: ${state.key} onExits`);
            }
        });
    }
    
    // Update startTransition
    if (workflowData.attributes && workflowData.attributes.startTransition) {
        const startTransition = workflowData.attributes.startTransition;
        if (startTransition.onExecutionTasks) {
            updateTasksInCollection(startTransition.onExecutionTasks, 'startTransition');
        }
    }
    
    // Update sharedTransitions
    if (workflowData.attributes && workflowData.attributes.sharedTransitions) {
        workflowData.attributes.sharedTransitions.forEach(sharedTransition => {
            if (sharedTransition.onExecutionTasks) {
                updateTasksInCollection(sharedTransition.onExecutionTasks, `sharedTransition: ${sharedTransition.key}`);
            }
        });
    }
    
    // Update states
    if (workflowData.attributes && workflowData.attributes.states) {
        updateRulesInStates(workflowData.attributes.states);
    }

    // Extension and Functions task
    if (workflowData.attributes && workflowData.attributes.task) {
        const taskItem = workflowData.attributes.task;
        if (taskItem) {
            updateTasksInCollection([taskItem], 'task');
        }
    }
    
    // Write updated JSON
    try {
        const updatedJson = JSON.stringify(workflowData, null, 2);
        fs.writeFileSync(jsonFile, updatedJson, 'utf-8');
        
        if (updatesCount > 0) {
            console.log(`✅ Successfully updated ${updatesCount} rules in {domainName} component: ${targetFileName}`);
        } else {
            console.log(`⚠️  No CSX rules found to update in {domainName} component: ${targetFileName}`);
        }
    } catch (error) {
        console.error(`❌ Error writing updated JSON: ${error.message}`);
    }
}

// Main execution
const args = process.argv.slice(2);
const workspaceRoot = path.resolve(__dirname, '../..');
const domainName = '{domainName}';

let targetDirectory;
let specificFile;

if (args.length === 0) {
    // Default to {domainName}/Workflows directory (can work with any component directory)
    targetDirectory = path.join(workspaceRoot, domainName, 'Workflows');
} else if (args.length === 1) {
    // Single argument - could be directory or specific file
    if (args[0].endsWith('.json')) {
        // It's a specific file, use current directory or domain components
        targetDirectory = path.join(workspaceRoot, domainName, 'Workflows');
        specificFile = args[0];
    } else {
        // It's a directory
        targetDirectory = path.resolve(args[0]);
    }
} else if (args.length === 2) {
    // Directory and specific file
    targetDirectory = path.resolve(args[0]);
    specificFile = args[1];
}

console.log('🚀 {domainName} Domain Component CSX Updater');
console.log('=' .repeat(50));

if (!fs.existsSync(targetDirectory)) {
    console.error(`❌ Target directory does not exist: ${targetDirectory}`);
    process.exit(1);
}

try {
    processWorkflowDirectory(targetDirectory, specificFile);
    console.log('✅ {domainName} domain component update completed');
} catch (error) {
    console.error(`❌ Error updating {domainName} components:`, error.message);
    process.exit(1);
} 