import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.essencequebec.app",
  appName: "Essence Québec",
  webDir: "dist",
  ios: {
    contentInset: "always",
  },
};

export default config;
