import { GuildMember, PermissionFlagsBits } from "discord.js";
import { config } from "../config/config.js";

export function isAdministrator(memberOrPermissions: unknown) {
  if (memberOrPermissions instanceof GuildMember) {
    return memberOrPermissions.permissions.has(PermissionFlagsBits.Administrator);
  }

  if (
    memberOrPermissions &&
    typeof memberOrPermissions === "object" &&
    "has" in memberOrPermissions &&
    typeof memberOrPermissions.has === "function"
  ) {
    return Boolean(memberOrPermissions.has(PermissionFlagsBits.Administrator));
  }

  return false;
}

export function hasStaffRole(member: unknown) {
  return member instanceof GuildMember && member.roles.cache.has(config.staffRoleId);
}
