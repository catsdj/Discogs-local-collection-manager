import { getDatabaseSyncService, stopDatabaseSyncService } from './databaseSyncService';

// Initialize database sync service on startup
export function initializeServices() {
  console.log('🚀 Initializing database services...');
  
  try {
    // Start the database sync service
    const syncService = getDatabaseSyncService();
    console.log('✅ Database sync service initialized');
    
    return {
      syncService
    };
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    throw error;
  }
}

// Cleanup function for graceful shutdown
export function cleanupServices() {
  console.log('🛑 Cleaning up services...');
  
  try {
    stopDatabaseSyncService();
    console.log('✅ Services cleaned up');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}
