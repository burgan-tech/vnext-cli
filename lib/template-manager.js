const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const simpleGit = require('simple-git');
const tar = require('tar');
const os = require('os');

class TemplateManager {
  constructor(options = {}) {
    // Load configuration from config file if exists
    const configDefaults = this.loadConfigFile();
    
    // Merge configurations with priority: options > environment > config file > defaults
    this.options = {
      cacheDir: this.getSystemCacheDir(),
      templateRepo: 'https://github.com/burgan-tech/vnext-template.git',
      gitToken: 'ghp_your_default_token_here',
      defaultVersion: 'latest',
      ...configDefaults,
      templateRepo: process.env.AMORPHIE_TEMPLATE_REPO || configDefaults.templateRepo || 'https://github.com/burgan-tech/vnext-template.git',
      gitToken: process.env.AMORPHIE_TEMPLATE_TOKEN || configDefaults.gitToken || 'ghp_your_default_token_here',
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
   * Configure Git credentials with built-in token
   */
  configureGitCredentials() {
    // Simple Git instance without complex credential configuration
    this.git = simpleGit();
  }

  /**
   * Download or update template from Git repository
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
   * Download template from Git repository
   * @param {string} version - Git tag version to download
   * @returns {Promise<void>}
   */
  async downloadTemplate(version) {
    const versionCacheDir = path.join(this.cacheDir, `template-${version}`);
    
    try {
      this.configureGitCredentials();
      
      // Build authenticated URL for GitHub
      const repoUrl = this.buildAuthenticatedUrl(this.options.templateRepo);
      
      console.log(chalk.gray(`Cloning ${version} from: ${this.options.templateRepo}`));
      
      await this.git.clone(repoUrl, versionCacheDir, [
        '--branch', version,
        '--single-branch',
        '--depth', '1'
      ]);
      
      // Remove .git directory to avoid conflicts
      const gitDir = path.join(versionCacheDir, '.git');
      if (await fs.pathExists(gitDir)) {
        await fs.remove(gitDir);
      }
      
      console.log(chalk.green(`✅ Template ${version} downloaded successfully`));
    } catch (error) {
      // Clean up on failure
      if (await fs.pathExists(versionCacheDir)) {
        await fs.remove(versionCacheDir);
      }
      throw new Error(`Failed to download template ${version}: ${error.message}`);
    }
  }

  /**
   * Build authenticated URL for Git operations
   * @param {string} repoUrl - Original repository URL
   * @returns {string} Authenticated URL
   */
  buildAuthenticatedUrl(repoUrl) {
    try {
      const url = new URL(repoUrl);
      
      // GitHub için token authentication
      if (url.hostname === 'github.com') {
        // Format: https://username:token@github.com/user/repo.git
        url.username = 'token';
        url.password = this.options.gitToken;
        return url.toString();
      }
      
      // GitLab için token authentication
      if (url.hostname.includes('gitlab')) {
        url.username = 'oauth2';
        url.password = this.options.gitToken;
        return url.toString();
      }
      
      // Diğer Git provider'lar için basic auth
      url.username = 'token';
      url.password = this.options.gitToken;
      return url.toString();
      
    } catch (error) {
      // URL parsing failed, fallback to simple replacement
      return repoUrl.replace('https://', `https://token:${this.options.gitToken}@`);
    }
  }

  /**
   * Resolve version string to actual git tag
   * @param {string} version - Version string ('latest', 'v1.0.0', etc.)
   * @returns {Promise<string>} Actual git tag
   */
  async resolveVersion(version) {
    if (version === 'latest') {
      try {
        const latestVersion = await this.getLatestVersion();
        console.log(chalk.gray(`Latest version resolved to: ${latestVersion}`));
        return latestVersion;
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Could not fetch latest version, trying default branch: ${error.message}`));
        // Try to detect default branch
        return await this.getDefaultBranch();
      }
    }
    return version;
  }

  /**
   * Get default branch name (main or master)
   * @returns {Promise<string>} Default branch name
   */
  async getDefaultBranch() {
    try {
      this.configureGitCredentials();
      const repoUrl = this.buildAuthenticatedUrl(this.options.templateRepo);
      
      const tempDir = path.join(this.cacheDir, 'temp-for-default-branch');
      await fs.ensureDir(tempDir);
      
      try {
        // Try to get remote info without cloning
        const git = simpleGit();
        const remoteInfo = await git.listRemote(['--heads', repoUrl]);
        
        // Parse remote heads to find default branch
        const branches = remoteInfo.split('\n')
          .filter(line => line.includes('refs/heads/'))
          .map(line => line.split('\t')[1].replace('refs/heads/', ''));
        
        // Check for common default branches
        if (branches.includes('main')) {
          console.log(chalk.gray('Default branch: main'));
          return 'main';
        } else if (branches.includes('master')) {
          console.log(chalk.gray('Default branch: master'));
          return 'master';
        } else if (branches.length > 0) {
          console.log(chalk.gray(`Default branch: ${branches[0]}`));
          return branches[0];
        }
        
        // Fallback
        return 'main';
      } finally {
        // Clean up temp directory
        if (await fs.pathExists(tempDir)) {
          await fs.remove(tempDir);
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not detect default branch, using 'main': ${error.message}`));
      return 'main';
    }
  }

  /**
   * Get latest version from git tags
   * @returns {Promise<string>} Latest version tag
   */
  async getLatestVersion() {
    try {
      this.configureGitCredentials();
      
      // Build authenticated URL
      const repoUrl = this.buildAuthenticatedUrl(this.options.templateRepo);
      
      // Clone sadece tag'leri almak için
      const tempDir = path.join(this.cacheDir, 'temp-for-tags');
      await fs.ensureDir(tempDir);
      
      try {
        await this.git.clone(repoUrl, tempDir, ['--bare']);
        
        const tempGit = simpleGit(tempDir);
        const tags = await tempGit.tags();
        
        // Clean up temp directory
        await fs.remove(tempDir);
        
        if (tags.all.length === 0) {
          throw new Error('No tags found in repository - repository needs to be tagged with semantic versions (v1.0.0, etc.)');
        }
        
        // En son tag'i bul (semantic versioning sırasına göre)
        const sortedTags = tags.all
          .filter(tag => tag.match(/^v?\d+\.\d+\.\d+$/)) // Semantic version pattern
          .sort((a, b) => {
            const aVersion = a.replace(/^v/, '');
            const bVersion = b.replace(/^v/, '');
            return this.compareVersions(bVersion, aVersion); // Descending order
          });
        
        if (sortedTags.length > 0) {
          return sortedTags[0];
        } else {
          // Semantic version olmayan tag'ler varsa en sonuncuyu al
          return tags.latest;
        }
      } catch (error) {
        // Clean up temp directory on error
        if (await fs.pathExists(tempDir)) {
          await fs.remove(tempDir);
        }
        throw error;
      }
    } catch (error) {
      throw new Error(`Failed to get latest version: ${error.message}`);
    }
  }

  /**
   * List all available versions from git tags
   * @returns {Promise<Array<string>>} Array of version tags
   */
  async listAvailableVersions() {
    try {
      this.configureGitCredentials();
      
      // Build authenticated URL
      const repoUrl = this.buildAuthenticatedUrl(this.options.templateRepo);
      
      const tempDir = path.join(this.cacheDir, 'temp-for-tags');
      await fs.ensureDir(tempDir);
      
      try {
        await this.git.clone(repoUrl, tempDir, ['--bare']);
        
        const tempGit = simpleGit(tempDir);
        const tags = await tempGit.tags();
        
        await fs.remove(tempDir);
        
        // Semantic version tag'leri filtrele ve sırala
        const versionTags = tags.all
          .filter(tag => tag.match(/^v?\d+\.\d+\.\d+$/))
          .sort((a, b) => {
            const aVersion = a.replace(/^v/, '');
            const bVersion = b.replace(/^v/, '');
            return this.compareVersions(bVersion, aVersion);
          });
        
        return versionTags;
      } catch (error) {
        if (await fs.pathExists(tempDir)) {
          await fs.remove(tempDir);
        }
        throw error;
      }
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
      const cacheItems = await fs.readdir(this.cacheDir);
      for (const item of cacheItems) {
        if (item.startsWith('template-')) {
          const itemPath = path.join(this.cacheDir, item);
          await fs.remove(itemPath);
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
        repository: this.options.templateRepo,
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
   * Set template repository URL
   * @param {string} repoUrl - Git repository URL
   * @param {string} branch - Git branch (optional)
   */
  setTemplateRepository(repoUrl, branch = 'main') {
    this.options.templateRepo = repoUrl;
    this.options.branch = branch;
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