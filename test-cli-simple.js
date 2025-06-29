const { execSync } = require('child_process');

try {
  console.log('🧪 Creating test project...');
  execSync('node create.js test-lint-project order-management', { stdio: 'inherit' });
  
  console.log('\n✅ Test project created');
  console.log('📁 Navigate to ../cli-test/test-lint-project');
  console.log('🔧 Run: cd customer-management && node .vscode/scripts/lint-domain.js order-management --verbose');
  
} catch (error) {
  console.error('❌ Error:', error.message);
} 