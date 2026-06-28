import crypto from "node:crypto";

export class VerificationService {
  static generateCode() {
    return crypto.randomBytes(4).toString("hex").toUpperCase();
  }

  static normalizeUsername(username: string, platform: "java" | "bedrock") {
    username = username.trim();

    if (platform === "bedrock" && !username.startsWith(".")) {
      username = "." + username;
    }

    return username;
  }
}