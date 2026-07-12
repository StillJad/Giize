export type JavaUsernameCheck =
  | {
      exists: true;
      canonicalUsername: string;
      uuid: string;
    }
  | {
      exists: false;
      reason: "invalid" | "not_found";
    }
  | {
      exists: false;
      reason: "network";
    };

type MojangProfileResponse = {
  id?: string;
  name?: string;
};

export class MinecraftProfileService {
  async checkJavaUsername(username: string): Promise<JavaUsernameCheck> {
    const normalized = username.trim();

    if (!/^[A-Za-z0-9_]{3,16}$/.test(normalized)) {
      return { exists: false, reason: "invalid" };
    }

    try {
      const response = await fetch(
        `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(normalized)}`,
        {
          signal: AbortSignal.timeout(4000),
        }
      );

      if (response.status === 204 || response.status === 404) {
        return { exists: false, reason: "not_found" };
      }

      if (!response.ok) {
        return { exists: false, reason: "network" };
      }

      const profile = (await response.json()) as MojangProfileResponse;

      if (!profile.id || !profile.name) {
        return { exists: false, reason: "not_found" };
      }

      return {
        exists: true,
        canonicalUsername: profile.name,
        uuid: profile.id,
      };
    } catch {
      return { exists: false, reason: "network" };
    }
  }
}

export const minecraftProfileService = new MinecraftProfileService();
