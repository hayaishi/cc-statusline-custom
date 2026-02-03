globalThis.__ccUpdaterDeps = {
  getOAuthToken: () => 'test-token',
  fetchOAuthUsage: async () => ({
    fiveHours: {
      utilization: 55,
      resetsAt: '2026-01-20T15:45:00Z',
    },
  }),
};

process.env.NODE_ENV = 'test';

export {};
