import { eq } from "drizzle-orm";
import { PermissionFlagsBits, type Guild, type GuildMember, type GuildTextBasedChannel } from "discord.js";
import { config } from "../../config/config.js";
import { db } from "../../database/database.js";
import { welcomeConfigs } from "../../database/schema.js";
import { logger } from "../../utils/logger.js";
import { welcomeDescription, welcomeRenderer, welcomeTitle } from "./WelcomeRenderer.js";

export type WelcomeConfig = {
  guildId: string;
  enabled: boolean;
  channelId: string;
  title: string;
  description: string;
  roleId: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  color: string | null;
  createdAt: number;
  updatedAt: number;
};

type SaveConfigInput = {
  guildId: string;
  channelId: string;
  title: string;
  description: string;
  roleId?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  color?: string | null;
};

export class WelcomeService {
  async saveConfig(input: SaveConfigInput) {
    const now = Date.now();
    const existingConfig = await this.getConfig(input.guildId);
    const values = {
      guildId: input.guildId,
      enabled: 1,
      channelId: input.channelId,
      title: input.title,
      description: input.description,
      roleId: input.roleId ?? null,
      imageUrl: this.optionalUrl(input.imageUrl),
      thumbnailUrl: this.optionalUrl(input.thumbnailUrl),
      color: this.optionalColor(input.color),
      createdAt: existingConfig?.createdAt ?? now,
      updatedAt: now,
    };

    await db
      .insert(welcomeConfigs)
      .values(values)
      .onConflictDoUpdate({
        target: welcomeConfigs.guildId,
        set: values,
      });
  }

  async disable(guildId: string) {
    const existingConfig = await this.getConfig(guildId);

    if (!existingConfig) {
      const now = Date.now();

      await db.insert(welcomeConfigs).values({
        guildId,
        enabled: 0,
        channelId: config.welcomeChannelId,
        title: welcomeTitle,
        description: welcomeDescription,
        roleId: null,
        imageUrl: null,
        thumbnailUrl: null,
        color: null,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await db
      .update(welcomeConfigs)
      .set({ enabled: 0, updatedAt: Date.now() })
      .where(eq(welcomeConfigs.guildId, guildId));
  }

  async enable(guildId: string) {
    const existingConfig = await this.getConfig(guildId);

    if (!existingConfig) {
      const now = Date.now();

      await db.insert(welcomeConfigs).values({
        guildId,
        enabled: 1,
        channelId: config.welcomeChannelId,
        title: welcomeTitle,
        description: welcomeDescription,
        roleId: null,
        imageUrl: null,
        thumbnailUrl: null,
        color: null,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await db
      .update(welcomeConfigs)
      .set({ enabled: 1, updatedAt: Date.now() })
      .where(eq(welcomeConfigs.guildId, guildId));
  }

  async refreshWording(guildId: string) {
    const existingConfig = await this.getConfig(guildId);
    const now = Date.now();

    if (!existingConfig) {
      await db.insert(welcomeConfigs).values({
        guildId,
        enabled: 1,
        channelId: config.welcomeChannelId,
        title: welcomeTitle,
        description: welcomeDescription,
        roleId: null,
        imageUrl: null,
        thumbnailUrl: null,
        color: null,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await db
      .update(welcomeConfigs)
      .set({
        title: welcomeTitle,
        description: welcomeDescription,
        updatedAt: now,
      })
      .where(eq(welcomeConfigs.guildId, guildId));
  }

  async getConfig(guildId: string) {
    const [config] = await db
      .select()
      .from(welcomeConfigs)
      .where(eq(welcomeConfigs.guildId, guildId))
      .limit(1);

    if (!config) {
      return undefined;
    }

    return {
      ...config,
      enabled: config.enabled === 1,
    } satisfies WelcomeConfig;
  }

  async sendWelcome(member: GuildMember) {
    const savedConfig = await this.getConfig(member.guild.id);
    const enabled = savedConfig?.enabled ?? true;
    const channelId = savedConfig?.channelId || config.welcomeChannelId;

    this.logJoin("member joined", {
      memberId: member.id,
      guildId: member.guild.id,
      configFound: Boolean(savedConfig),
      enabled,
      channelId,
    });

    if (!enabled) {
      this.logJoin("welcome skipped because disabled", {
        memberId: member.id,
        guildId: member.guild.id,
      });
      return;
    }

    const roleId = savedConfig?.roleId || config.welcomeRoleId;

    if (roleId) {
      await member.roles.add(roleId, "Welcome role")
        .then(() => {
          this.logJoin("welcome auto-role assigned", {
            memberId: member.id,
            guildId: member.guild.id,
            roleId,
          });
        })
        .catch(error => {
          logger.warn(`Welcome auto-role assignment failed: ${JSON.stringify({
            memberId: member.id,
            guildId: member.guild.id,
            roleId,
          })}`, error);
        });
    } else {
      this.logJoin("welcome auto-role skipped", {
        memberId: member.id,
        guildId: member.guild.id,
        roleId: null,
      });
    }

    const channel = await member.guild.channels.fetch(channelId).catch(error => {
      logger.warn(`Welcome channel fetch failed: ${JSON.stringify({
        memberId: member.id,
        guildId: member.guild.id,
        channelId,
      })}`, error);
      return null;
    });

    const isTextBased = Boolean(channel?.isTextBased());

    this.logJoin("welcome channel resolved", {
      memberId: member.id,
      guildId: member.guild.id,
      channelId,
      channelExists: Boolean(channel),
      isTextBased,
    });

    if (!channel?.isTextBased() || !("send" in channel)) {
      logger.warn(`Welcome message not sent: ${JSON.stringify({
        memberId: member.id,
        guildId: member.guild.id,
        channelId,
        reason: !channel ? "channel missing" : "channel is not text based",
      })}`);
      return;
    }

    const botMember = member.guild.members.me ?? (await member.guild.members.fetchMe().catch(() => null));

    if (!botMember) {
      logger.warn(`Welcome message not sent: ${JSON.stringify({
        memberId: member.id,
        guildId: member.guild.id,
        channelId,
        reason: "bot member could not be resolved",
      })}`);
      return;
    }

    const permissions = channel.permissionsFor(botMember);
    const permissionStatus = {
      viewChannel: Boolean(permissions?.has(PermissionFlagsBits.ViewChannel)),
      sendMessages: Boolean(permissions?.has(PermissionFlagsBits.SendMessages)),
      embedLinks: Boolean(permissions?.has(PermissionFlagsBits.EmbedLinks)),
    };

    this.logJoin("welcome channel permissions", {
      memberId: member.id,
      guildId: member.guild.id,
      channelId,
      ...permissionStatus,
    });

    const missingPermissions = [
      permissionStatus.viewChannel ? "" : "View Channel",
      permissionStatus.sendMessages ? "" : "Send Messages",
      permissionStatus.embedLinks ? "" : "Embed Links",
    ].filter(Boolean);

    if (missingPermissions.length > 0) {
      logger.warn(`Welcome message not sent: ${JSON.stringify({
        memberId: member.id,
        guildId: member.guild.id,
        channelId,
        reason: "missing permissions",
        missingPermissions,
      })}`);
      return;
    }

    await (channel as GuildTextBasedChannel).send({
      content: `<@${member.id}>`,
      allowedMentions: {
        users: [member.id],
      },
      embeds: [welcomeRenderer.render(member)],
    });

    this.logJoin("welcome message sent", {
      memberId: member.id,
      guildId: member.guild.id,
      channelId,
      sent: true,
    });
  }

  async preview(guild: Guild, member: GuildMember) {
    const savedConfig = await this.getConfig(guild.id);

    return savedConfig && !savedConfig.enabled ? undefined : welcomeRenderer.render(member);
  }

  private optionalUrl(value?: string | null) {
    if (!value) return null;

    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? value : null;
    } catch {
      return null;
    }
  }

  private optionalColor(value?: string | null) {
    return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
  }

  private logJoin(message: string, data: Record<string, unknown>) {
    logger.info(`Welcome join: ${message} ${JSON.stringify(data)}`);
  }
}

export const welcomeService = new WelcomeService();
