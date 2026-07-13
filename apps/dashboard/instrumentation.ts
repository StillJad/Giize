import { dashboardConfig } from "./lib/config";

export function register() {
  console.log(`Dashboard config: internal secret configured=${Boolean(dashboardConfig.internalSecret)} session secret configured=${Boolean(dashboardConfig.sessionSecret)} guild ID configured=${Boolean(dashboardConfig.guildId)}`);
}
