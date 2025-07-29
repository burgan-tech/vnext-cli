/**
 * Template Repository Configuration
 * 
 * Bu dosya Amorphie CLI'nin template repository ayarlarını içerir.
 * Production ortamında bu değerler environment variable'lar ile override edilmelidir.
 */

module.exports = {
  // Template Repository URL
  // Environment variable: AMORPHIE_TEMPLATE_REPO
  templateRepo: 'https://github.com/amorphie/Amorphie.Template.git',
  
  schema: {
    npmRegistry: 'https://npm.pkg.github.com',
    schemaPackageName: '@amorphie/schema-definitions'
  },
  
  gitToken: '',
  
  // Default Template Version
  defaultVersion: 'latest',
  
  // Template Cache Directory (relative to project root)
  cacheDir: '.amorphie-template-cache',
  
  // Supported Version Pattern (Semantic Versioning)
  versionPattern: /^v?\d+\.\d+\.\d+$/,
  
  // Template Structure Validation
  requiredFiles: [
    'amorphie.config.json',
    'package.json',
    '{domainName}/Tasks',
    '{domainName}/Workflows',
    '{domainName}/Functions',
    '{domainName}/Views',
    '{domainName}/Schemas',
    '{domainName}/Extensions'
  ],
  
  // Placeholder Replacements
  placeholders: {
    '{packageName}': 'projectName',
    '{domainName}': 'domainName'
  },
  
  // Git Clone Options
  cloneOptions: {
    singleBranch: true,
    depth: 1
  }
}; 