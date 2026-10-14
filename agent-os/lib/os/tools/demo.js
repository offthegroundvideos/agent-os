export const demoTool = {
  name: 'system.demo',
  actionType: 'system.demo',
  describe: (payload) => `Demo action: ${payload.draft}`,
  async execute(payload) {
    return { echoed: payload.draft };
  },
};
