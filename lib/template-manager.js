const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const os = require('os');
const { execSync } = require('child_process');

class TemplateManager {
  constructor(options = {}) {
    // Load configuration from config file if exists
    const configDefaults = this.loadConfigFile();
    
    // Merge configurations with priority: options > environment > config file > defaults
    this.options = {
      cacheDir: this.getSystemCacheDir(),
      packageName: '@burgan-tech/vnext-template',
      npmRegistry: 'https://registry.npmjs.org',
      defaultVersion: 'latest',
      ...configDefaults,
      packageName: process.env.AMORPHIE_TEMPLATE_PACKAGE || (configDefaults.template && configDefaults.template.packageName) || '@burgan-tech/vnext-template',
      npmRegistry: process.env.AMORPHIE_TEMPLATE_REGISTRY || (configDefaults.template && configDefaults.template.npmRegistry) || 'https://registry.npmjs.org',
      cacheDir: process.env.AMORPHIE_CACHE_DIR || this.getSystemCacheDir(),
      ...options
    };
    
    this.cacheDir = this.options.cacheDir;
    this.templateCacheDir = path.join(this.cacheDir, 'template');
    this.currentVersion = null;
    
    // Show cache directory info
    console.log(chalk.gray(`📁 Cache directory: ${this.cacheDir}`));
  }

  /**
   * Get system-appropriate cache directory
   * @returns {string} Cache directory path
   */
  getSystemCacheDir() {
    const platform = os.platform();
    const homedir = os.homedir();
    
    switch (platform) {
      case 'darwin': // macOS
        return path.join(homedir, 'Library', 'Caches', 'vnext-cli');
      
      case 'win32': // Windows
        return path.join(process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming'), 'vnext-cli', 'cache');
      
      case 'linux': // Linux
      default: // Other Unix-like systems
        return path.join(process.env.XDG_CACHE_HOME || path.join(homedir, '.cache'), 'vnext-cli');
    }
  }

  /**
   * Load configuration from config file
   * @returns {Object} Configuration object
   */
  loadConfigFile() {
    try {
      const configPath = path.join(__dirname, '..', 'config', 'template.config.js');
      if (fs.existsSync(configPath)) {
        delete require.cache[require.resolve(configPath)]; // Clear cache
        const config = require(configPath);
        console.log(chalk.gray('📄 Loaded template configuration from config file'));
        return config;
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load config file: ${error.message}`));
    }
    return {};
  }



  /**
   * Download or update template from NPM package
   * @param {string} version - Template version (latest, v1.0.0, etc.)
   * @returns {Promise<string>} Path to downloaded template
   */
  async ensureTemplate(version = 'latest') {
    try {
      console.log(chalk.blue('📦 Checking template...'));
      
      // Ensure cache directory exists
      await fs.ensureDir(this.cacheDir);
      
      // Resolve version to actual tag
      const actualVersion = await this.resolveVersion(version);
      const versionCacheDir = path.join(this.cacheDir, `template-${actualVersion}`);
      
      // Check if this specific version is cached
      if (await fs.pathExists(versionCacheDir)) {
        console.log(chalk.green(`✅ Template ${actualVersion} found in cache`));
        this.templateCacheDir = versionCacheDir;
        this.currentVersion = actualVersion;
        return versionCacheDir;
      } else {
        console.log(chalk.blue(`⬇️  Downloading template version ${actualVersion}...`));
        await this.downloadTemplate(actualVersion);
        this.templateCacheDir = versionCacheDir;
        this.currentVersion = actualVersion;
        return versionCacheDir;
      }
    } catch (error) {
      throw new Error(`Failed to ensure template: ${error.message}`);
    }
  }

  /**
   * Download template package from NPM
   * @param {string} version - NPM package version to download
   * @returns {Promise<void>}
   */
  async downloadTemplate(version) {
    const versionCacheDir = path.join(this.cacheDir, `template-${version}`);
    const tempDir = path.join(this.cacheDir, 'temp');
    
    try {
      // Test cache directory write permissions first
      try {
        await fs.ensureDir(this.cacheDir);
        await fs.ensureDir(tempDir);
        await fs.ensureDir(versionCacheDir);
      } catch (error) {
        throw new Error(`Cannot write to cache directory '${this.cacheDir}'. Check file permissions. Original error: ${error.message}`);
      }
      
      console.log(chalk.gray(`Downloading ${this.options.packageName}@${version} from ${this.options.npmRegistry}`));
      
      // Build npm pack command with registry and custom cache
      const packageSpec = version === 'latest' ? this.options.packageName : `${this.options.packageName}@${version}`;
      const customCacheDir = path.join(this.cacheDir, 'npm-cache');
      await fs.ensureDir(customCacheDir);
      const npmPackCmd = `npm pack ${packageSpec} --pack-destination ${tempDir} --registry ${this.options.npmRegistry} --cache ${customCacheDir}`;
      
      // Download package using npm pack
      let packOutput;
      try {
        packOutput = execSync(npmPackCmd, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
      } catch (error) {
        if (error.message.includes('404')) {
          throw new Error(`Template package '${this.options.packageName}@${version}' not found in registry '${this.options.npmRegistry}'. Check package name and version.`);
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
          throw new Error(`Network error: Cannot connect to NPM registry '${this.options.npmRegistry}'. Check your internet connection.`);
        } else if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
          throw new Error(`Permission denied accessing NPM registry '${this.options.npmRegistry}'. For GitHub Package Registry, ensure you have proper authentication. Run: npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_TOKEN`);
        } else if (error.message.includes('EEXIST') || error.message.includes('File exists')) {
          throw new Error(`NPM cache conflict. Try running: npm cache clean --force, then retry the command.`);
        } else {
          throw new Error(`NPM command failed: ${error.message}. Check NPM configuration and registry access.`);
        }
      }
      
      const tarFile = packOutput.trim();
      const tarPath = path.join(tempDir, tarFile);
      
      // Verify tar file was downloaded
      if (!(await fs.pathExists(tarPath))) {
        throw new Error(`Downloaded tar file not found at '${tarPath}'. NPM pack command may have failed silently.`);
      }
      
      // Extract tar file
      const extractCmd = process.platform === 'win32' 
        ? `tar -xzf "${tarPath}" -C "${versionCacheDir}" --strip-components=1`
        : `tar -xzf ${tarPath} -C ${versionCacheDir} --strip-components=1`;
        
      try {
        execSync(extractCmd, {
          stdio: 'pipe'
        });
      } catch (error) {
        throw new Error(`Failed to extract template package: ${error.message}. Package may be corrupted.`);
      }
      
      // Clean up tar file
      await fs.remove(tarPath);
      
      // Verify template files exist
      const templateFiles = await fs.readdir(versionCacheDir);
      if (templateFiles.length === 0) {
        throw new Error(`Downloaded package '${this.options.packageName}@${version}' appears to be empty.`);
      }
      
      console.log(chalk.green(`✅ Template package ${version} downloaded successfully`));
      
    } catch (error) {
      // Clean up on failure
      if (await fs.pathExists(versionCacheDir)) {
        await fs.remove(versionCacheDir);
      }
      
      // Re-throw with more context
      throw error;
    } finally {
      // Clean up temp directory
      if (await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
      }
    }
  }



  /**
   * Resolve version string to actual npm version
   * @param {string} version - Version string ('latest', 'v1.0.0', etc.)
   * @returns {Promise<string>} Actual npm version
   */
  async resolveVersion(version) {
    if (version === 'latest') {
      try {
        const latestVersion = await this.getLatestVersion();
        console.log(chalk.gray(`Latest version resolved to: ${latestVersion}`));
        return latestVersion;
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Could not fetch latest version, using 'latest': ${error.message}`));
        return 'latest';
      }
    }
    return version;
  }



  /**
   * Get latest version from NPM registry
   * @returns {Promise<string>} Latest version tag
   */
  async getLatestVersion() {
    try {
      const npmViewCmd = `npm view ${this.options.packageName} version --registry ${this.options.npmRegistry}`;
      
      const latestVersion = execSync(npmViewCmd, {
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      
      return latestVersion;
    } catch (error) {
      throw new Error(`Failed to get latest version: ${error.message}`);
    }
  }

  /**
   * List all available versions from NPM registry
   * @returns {Promise<Array<string>>} Array of version tags
   */
  async listAvailableVersions() {
    try {
      const npmViewCmd = `npm view ${this.options.packageName} versions --json --registry ${this.options.npmRegistry}`;
      
      const versionsOutput = execSync(npmViewCmd, {
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      
      const versions = JSON.parse(versionsOutput);
      
      // Return sorted versions (newest first)
      return Array.isArray(versions) ? versions.reverse() : [versions];
    } catch (error) {
      throw new Error(`Failed to list versions: ${error.message}`);
    }
  }

  /**
   * Compare semantic versions
   * @param {string} version1 - First version
   * @param {string} version2 - Second version  
   * @returns {number} Comparison result
   */
  compareVersions(version1, version2) {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  }

  /**
   * Update template cache (remove all cached versions)
   * @returns {Promise<void>}
   */
  async updateTemplate() {
    try {
      console.log(chalk.blue('🔄 Clearing template cache...'));
      
      // Remove all cached template versions
      if (await fs.pathExists(this.cacheDir)) {
        const cacheItems = await fs.readdir(this.cacheDir);
        for (const item of cacheItems) {
          if (item.startsWith('template-')) {
            const itemPath = path.join(this.cacheDir, item);
            await fs.remove(itemPath);
          }
        }
      }
      
      console.log(chalk.green('✅ Template cache cleared'));
    } catch (error) {
      throw new Error(`Failed to update template: ${error.message}`);
    }
  }

  /**
   * Copy template to target directory with placeholder replacement
   * @param {string} targetPath - Target directory path
   * @param {string} projectName - Project name
   * @param {string} domainName - Domain name
   * @returns {Promise<void>}
   */
  async copyTemplate(targetPath, projectName, domainName) {
    const templatePath = this.templateCacheDir;
    
    if (!(await fs.pathExists(templatePath))) {
      throw new Error('Template not found. Please run ensureTemplate() first.');
    }
    
    console.log(chalk.blue('📁 Copying template files...'));
    
    const items = await fs.readdir(templatePath);
    console.log('📂 Files found in template:', items);
    
    for (const item of items) {
      const sourcePath = path.join(templatePath, item);
      const stat = await fs.stat(sourcePath);
      
      if (stat.isDirectory()) {
        if (item === '{domainName}') {
          const actualTargetPath = path.join(targetPath, domainName);
          await this.copyDirectoryRecursive(sourcePath, actualTargetPath, projectName, domainName);
        } else {
          const targetItemPath = path.join(targetPath, item);
          await this.copyDirectoryRecursive(sourcePath, targetItemPath, projectName, domainName);
        }
      } else {
        const targetItemPath = path.join(targetPath, item);
        console.log(`📄 Copying file: ${item}`);
        await this.copyFileWithPlaceholders(sourcePath, targetItemPath, projectName, domainName);
      }
    }
    
    // Handle critical files
    const criticalFiles = ['.gitignore', '.cursorrules'];
    for (const file of criticalFiles) {
      const sourcePath = path.join(templatePath, file);
      const targetPath_file = path.join(targetPath, file);
      
      if (await fs.pathExists(sourcePath) && !(await fs.pathExists(targetPath_file))) {
        console.log(`⚠️  Missing critical file ${file}, copying now...`);
        await this.copyFileWithPlaceholders(sourcePath, targetPath_file, projectName, domainName);
      }
    }
    
    console.log(chalk.green('✅ Template copied successfully'));
  }

  /**
   * Recursively copy directory with placeholder replacement
   * @param {string} sourcePath - Source directory path
   * @param {string} targetPath - Target directory path
   * @param {string} projectName - Project name
   * @param {string} domainName - Domain name
   * @returns {Promise<void>}
   */
  async copyDirectoryRecursive(sourcePath, targetPath, projectName, domainName) {
    await fs.ensureDir(targetPath);
    
    const items = await fs.readdir(sourcePath);
    
    for (const item of items) {
      const sourceItemPath = path.join(sourcePath, item);
      const targetItemPath = path.join(targetPath, item);
      const stat = await fs.stat(sourceItemPath);
      
      if (stat.isDirectory()) {
        await this.copyDirectoryRecursive(sourceItemPath, targetItemPath, projectName, domainName);
      } else {
        await this.copyFileWithPlaceholders(sourceItemPath, targetItemPath, projectName, domainName);
      }
    }
  }

  /**
   * Copy file with placeholder replacement
   * @param {string} sourcePath - Source file path
   * @param {string} targetPath - Target file path
   * @param {string} projectName - Project name
   * @param {string} domainName - Domain name
   * @returns {Promise<void>}
   */
  async copyFileWithPlaceholders(sourcePath, targetPath, projectName, domainName) {
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
      // If text processing fails, copy as binary
      await fs.copy(sourcePath, targetPath);
    }
  }

  /**
   * Force refresh template (clear cache and re-download)
   * @returns {Promise<string>} Path to downloaded template
   */
  async refreshTemplate() {
    console.log(chalk.blue('🔄 Refreshing template cache...'));
    
    if (await fs.pathExists(this.cacheDir)) {
      await fs.remove(this.cacheDir);
    }
    
    return await this.ensureTemplate();
  }

  /**
   * Get template information
   * @param {string} version - Template version to get info for
   * @returns {Promise<Object>} Template information
   */
  async getTemplateInfo(version = 'latest') {
    try {
      const templatePath = await this.ensureTemplate(version);
      
      const packageJsonPath = path.join(templatePath, 'package.json');
      const configPath = path.join(templatePath, 'vnext.config.json');
      
      const info = {
        packageName: this.options.packageName,
        npmRegistry: this.options.npmRegistry,
        version: this.currentVersion,
        path: templatePath,
        exists: await fs.pathExists(templatePath),
        packageJson: null,
        config: null,
        availableVersions: []
      };
      
      // Get available versions
      try {
        info.availableVersions = await this.listAvailableVersions();
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Could not fetch available versions: ${error.message}`));
      }
      
      if (await fs.pathExists(packageJsonPath)) {
        info.packageJson = await fs.readJSON(packageJsonPath);
      }
      
      if (await fs.pathExists(configPath)) {
        info.config = await fs.readJSON(configPath);
      }
      
      return info;
    } catch (error) {
      throw new Error(`Failed to get template info: ${error.message}`);
    }
  }

  /**
   * Set template package configuration
   * @param {string} packageName - NPM package name
   * @param {string} npmRegistry - NPM registry URL (optional)
   */
  setTemplatePackage(packageName, npmRegistry = 'https://registry.npmjs.org') {
    this.options.packageName = packageName;
    this.options.npmRegistry = npmRegistry;
  }

  /**
   * Clear template cache
   * @returns {Promise<void>}
   */
  async clearCache() {
    if (await fs.pathExists(this.cacheDir)) {
      await fs.remove(this.cacheDir);
      console.log(chalk.green('✅ Template cache cleared'));
    }
  }
}

module.exports = TemplateManager; 