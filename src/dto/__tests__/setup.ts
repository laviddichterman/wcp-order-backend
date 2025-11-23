// Set up test environment
process.env.NODE_ENV = 'test';

// Mock localStorage if it doesn't exist
if (typeof localStorage === 'undefined') {
  (global as any).localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
}

// Mock the config/dataprovider module before any tests run
jest.mock('../../config/dataprovider', () => ({
  DataProviderInstance: {
    Fulfillments: {
      'validFulfillmentId': { name: 'Test Fulfillment' },
      'delivery': { name: 'Delivery' },
      'pickup': { name: 'Pickup' },
      'dinein': { name: 'Dine In' },
      'fulfillment1': { name: 'Test Fulfillment 1' },
      'fulfillment2': { name: 'Test Fulfillment 2' }
    }
  }
}));

// Mock other potential dependencies that might need localStorage
jest.mock('../../config/database_manager', () => ({}));
jest.mock('../../config/socketio_provider', () => ({}));
jest.mock('../../logging', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }
}));
