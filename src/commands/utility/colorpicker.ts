import {SlashCommandBuilder} from 'discord.js';
import type {Command} from '../../types/Command.js';
import {colorPickerService} from '../../services/community/ColorPickerService.js';
export const command:Command={data:new SlashCommandBuilder().setName('colorpicker').setDescription('Post a role colour picker anyone in this channel can use.').addRoleOption(o=>o.setName('role').setDescription('Role whose colour people can customise.').setRequired(true)),execute:i=>colorPickerService.create(i)};
