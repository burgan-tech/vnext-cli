/**
 * Template Repository Configuration
 * 
 * Bu dosya vNext CLI'nin template repository ayarlarını içerir.
 * Production ortamında bu değerler environment variable'lar ile override edilmelidir.
 */

module.exports = {
  // Template NPM Package Configuration
  template: {
    npmRegistry: 'https://registry.npmjs.org',
    packageName: '@burgan-tech/vnext-template'
  },
  
  schema: {
    npmRegistry: 'https://registry.npmjs.org',
    schemaPackageName: '@burgan-tech/vnext-schema'
  },
  
  // Default Template Version
  defaultVersion: 'latest',
  
  // Template Cache Directory (relative to project root)
  cacheDir: '.vnext-template-cache',
  
  // Supported Version Pattern (Semantic Versioning)
  versionPattern: /^v?\d+\.\d+\.\d+$/,
  
  // Template Structure Validation
  requiredFiles: [
    'vnext.config.json',
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