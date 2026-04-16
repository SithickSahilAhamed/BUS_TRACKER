/**
 * PM2 ECOSYSTEM CONFIGURATION
 * Manages process supervision and clustering for production
 * 
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 start ecosystem.config.js --env development
 *   pm2 logs app
 *   pm2 monit
 *   pm2 delete all
 */

module.exports = {
  apps: [
    {
      name: 'bus-tracking-backend',
      script: './dist/server.js',
      cwd: './backend',
      
      // Clustering
      instances: 'max',
      exec_mode: 'cluster',
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      
      // Logging
      output: './logs/out.log',
      error: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Restart policies
      autorestart: true,
      max_memory_restart: '500M', // Restart if memory > 500MB
      
      // Graceful shutdown
      wait_ready: true,
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Watch & reload (development only)
      watch: false,
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'logs', '.env'],
      
      // Monitoring
      max_restarts: 10,
      min_uptime: '10s',
    },
    
    {
      name: 'bus-tracking-frontend',
      script: 'npm',
      args: 'run preview', // or 'run dev' for development
      cwd: './frontend',
      
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      
      output: './logs/out.log',
      error: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      autorestart: true,
      max_memory_restart: '300M',
    },
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-production-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/bus-tracker.git',
      path: '/var/www/bus-tracker',
      
      'post-deploy': 'npm install && npm run build && pm2 startOrRestart ecosystem.config.js --env production',
      
      'pre-deploy-local': 'echo "Deploying to production"',
    },
    
    staging: {
      user: 'deploy',
      host: 'staging-server.com',
      ref: 'origin/develop',
      repo: 'git@github.com:yourusername/bus-tracker.git',
      path: '/var/www/bus-tracker-staging',
      
      'post-deploy': 'npm install && npm run build && pm2 startOrRestart ecosystem.config.js --env production',
    },
  },
};

/**
 * INSTALLATION & SETUP:
 * 
 * # Install PM2 globally
 * npm install -g pm2
 * 
 * # Setup PM2 to start on system boot
 * pm2 startup
 * pm2 save
 * 
 * # Start with ecosystem file (development)
 * pm2 start ecosystem.config.js
 * 
 * # Start with production mode
 * pm2 start ecosystem.config.js --env production
 * 
 * # Monitor
 * pm2 monit
 * pm2 logs
 * 
 * # Restart all
 * pm2 restart all
 * 
 * # Stop all
 * pm2 stop all
 * 
 * # Kill and delete all
 * pm2 delete all
 * 
 * # Zero-downtime reload
 * pm2 reload all
 */
