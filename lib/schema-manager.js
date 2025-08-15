const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const os = require('os');
const { execSync } = require('child_process');

class SchemaManager {
  constructor(options = {}) {
    // Load configuration from config file if exists
    const configDefaults = this.loadConfigFile();
    
    // Merge configurations with priority: options > environment > config file > defaults
    this.options = {
      cacheDir: this.getSystemCacheDir(),
      schemaPackageName: '@burgan-tech/vnext-schema',
      npmRegistry: 'https://registry.npmjs.org',
      defaultVersion: 'latest',
      ...configDefaults,
      schemaPackageName: process.env.AMORPHIE_SCHEMA_PACKAGE || configDefaults.schemaPackageName || '@burgan-tech/vnext-schema',
      npmRegistry: process.env.AMORPHIE_NPM_REGISTRY || configDefaults.npmRegistry || 'https://registry.npmjs.org',
      cacheDir: process.env.AMORPHIE_CACHE_DIR || this.getSystemCacheDir(),
      ...options
    };
    
    this.cacheDir = this.options.cacheDir;
    this.schemaCacheDir = path.join(this.cacheDir, 'schemas');
    this.currentVersion = null;
    
    // Show cache directory info
    console.log(chalk.gray(`📁 Schema cache directory: ${this.schemaCacheDir}`));
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
        return path.join(homedir, 'Library', 'Caches', 'vnext-cli', 'schemas');
      
      case 'win32': // Windows
        return path.join(process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming'), 'vnext-cli', 'cache', 'schemas');
      
      case 'linux': // Linux
      default: // Other Unix-like systems
        return path.join(process.env.XDG_CACHE_HOME || path.join(homedir, '.cache'), 'vnext-cli', 'schemas');
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
        console.log(chalk.gray('📄 Loaded schema configuration from config file'));
        return config.schema || {};
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load schema config file: ${error.message}`));
    }
    return {};
  }

  /**
   * Ensure schema package is available for a specific runtime version
   * @param {string} runtimeVersion - Runtime version (latest, v1.0.0, etc.)
   * @returns {Promise<string>} Path to schema directory
   */
  async ensureSchemas(runtimeVersion = 'latest') {
    try {
      console.log(chalk.blue('📋 Checking schema package...'));
      
      // Ensure cache directory exists
      await fs.ensureDir(this.schemaCacheDir);
      
      // Resolve version to actual tag/version
      const actualVersion = await this.resolveVersion(runtimeVersion);
      const versionCacheDir = path.join(this.schemaCacheDir, `${actualVersion}`);
      const schemaPath = path.join(versionCacheDir, 'schemas');
      
      // Check if this specific version is cached
      if (await fs.pathExists(schemaPath)) {
        console.log(chalk.green(`✅ Schema package ${actualVersion} found in cache`));
        this.currentVersion = actualVersion;
        return schemaPath;
      } else {
        console.log(chalk.blue(`⬇️  Downloading schema package version ${actualVersion}...`));
        await this.downloadSchemaPackage(actualVersion);
        this.currentVersion = actualVersion;
        return schemaPath;
      }
    } catch (error) {
      throw new Error(`Failed to ensure schema package: ${error.message}`);
    }
  }

  /**
   * Download schema package from NPM
   * @param {string} version - NPM package version to download
   * @returns {Promise<void>}
   */
  async downloadSchemaPackage(version) {
    const versionCacheDir = path.join(this.schemaCacheDir, `${version}`);
    const tempDir = path.join(this.schemaCacheDir, 'temp');
    
    try {
      // Test cache directory write permissions first
      try {
        await fs.ensureDir(this.schemaCacheDir);
        await fs.ensureDir(tempDir);
        await fs.ensureDir(versionCacheDir);
      } catch (error) {
        throw new Error(`Cannot write to cache directory '${this.schemaCacheDir}'. Check file permissions. Original error: ${error.message}`);
      }
      
      console.log(chalk.gray(`Downloading ${this.options.schemaPackageName}@${version} from ${this.options.npmRegistry}`));
      
      // Build npm pack command with registry and custom cache
      const packageSpec = version === 'latest' ? this.options.schemaPackageName : `${this.options.schemaPackageName}@${version}`;
      const customCacheDir = path.join(this.schemaCacheDir, 'npm-cache');
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
          throw new Error(`Schema package '${this.options.schemaPackageName}@${version}' not found in registry '${this.options.npmRegistry}'. Check package name and version.`);
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
        throw new Error(`Failed to extract schema package: ${error.message}. Package may be corrupted.`);
      }
      
      // Clean up tar file and temp directory
      await fs.remove(tarPath);
      
      // Verify schema directory exists in the package
      const schemaPath = path.join(versionCacheDir, 'schemas');
      if (!(await fs.pathExists(schemaPath))) {
        throw new Error(`Downloaded package '${this.options.schemaPackageName}@${version}' does not contain 'schemas' directory. Package structure is invalid.`);
      }
      
      // Verify schema files exist
      const schemaFiles = await fs.readdir(schemaPath);
      const jsonSchemas = schemaFiles.filter(file => file.endsWith('.json'));
      if (jsonSchemas.length === 0) {
        throw new Error(`No schema files found in '${this.options.schemaPackageName}@${version}'. Package may be empty or invalid.`);
      }
      
      console.log(chalk.green(`✅ Schema package ${version} downloaded successfully (${jsonSchemas.length} schema files)`));
      
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
        console.log(chalk.gray(`Latest schema version resolved to: ${latestVersion}`));
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
      const npmViewCmd = `npm view ${this.options.schemaPackageName} version --registry ${this.options.npmRegistry}`;
      
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
      const npmViewCmd = `npm view ${this.options.schemaPackageName} versions --json --registry ${this.options.npmRegistry}`;
      
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
   * Update schema cache (remove all cached versions)
   * @returns {Promise<void>}
   */
  async updateSchemas() {
    try {
      console.log(chalk.blue('🔄 Clearing schema cache...'));
      
      if (await fs.pathExists(this.schemaCacheDir)) {
        await fs.remove(this.schemaCacheDir);
      }
      
      console.log(chalk.green('✅ Schema cache cleared'));
    } catch (error) {
      throw new Error(`Failed to update schemas: ${error.message}`);
    }
  }

  /**
   * Get schema package information
   * @param {string} version - Schema version to get info for
   * @returns {Promise<Object>} Schema package information
   */
  async getSchemaInfo(version = 'latest') {
    try {
      const schemaPath = await this.ensureSchemas(version);
      
      const packageJsonPath = path.join(path.dirname(schemaPath), 'package.json');
      
      const info = {
        packageName: this.options.schemaPackageName,
        version: this.currentVersion,
        path: schemaPath,
        exists: await fs.pathExists(schemaPath),
        packageJson: null,
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
      
      // List schema files
      if (await fs.pathExists(schemaPath)) {
        const schemaFiles = await fs.readdir(schemaPath);
        info.schemaFiles = schemaFiles.filter(file => file.endsWith('.json'));
      }
      
      return info;
    } catch (error) {
      throw new Error(`Failed to get schema info: ${error.message}`);
    }
  }

  /**
   * Clear schema cache
   * @returns {Promise<void>}
   */
  async clearCache() {
    if (await fs.pathExists(this.schemaCacheDir)) {
      await fs.remove(this.schemaCacheDir);
      console.log(chalk.green('✅ Schema cache cleared'));
    }
  }

  /**
   * Check if runtime version has changed and update if necessary
   * @param {string} configPath - Path to vnext.config.json
   * @returns {Promise<string>} Schema path for the runtime version
   */
  async ensureSchemasForConfig(configPath) {
    try {
      // Load vnext.config.json
      if (!(await fs.pathExists(configPath))) {
        throw new Error('vnext.config.json not found');
      }

      const config = await fs.readJSON(configPath);
      const runtimeVersion = config.runtimeVersion || 'latest';
      
      console.log(chalk.blue(`🔖 Using runtime version: ${runtimeVersion}`));
      
      // Ensure schema package for this runtime version
      return await this.ensureSchemas(runtimeVersion);
    } catch (error) {
      throw new Error(`Failed to ensure schemas for config: ${error.message}`);
    }
  }
}

module.exports = SchemaManager; 