const {
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	ContainerBuilder,
	MessageFlags,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize
} = require('discord.js');
const { createBackToSettingsButton } = require('../backToSettings');
const { getUserInfo, assertUserMatches, handleError, hasPermission } = require('../../utility/commonFunctions');
const { getEmojiMapForUser, getComponentEmoji } = require('../../utility/emojis');
const { createEmojiCreateButton } = require('./emojisCreate');
const { createEmojiEditButton } = require('./emojisEdit');
const { createEmojiViewButton } = require('./emojisView');
const { createEmojiTemplateButton } = require('./emojisTemplate');
const { createEmojiDeleteButton } = require('./emojisDelete');
const { createEmojiReloadButton } = require('./emojisReload');
const { createEmojiActivateButton } = require('./emojisActivate');
const { PERMISSIONS } = require('../admin/permissions');


/**
 * Creates the emoji theme button for settings
 * @param {string} userId
 * @param {Object} lang
 * @returns {ButtonBuilder}
 */
function createEmojiThemeButton(userId, lang = {}) {
	return new ButtonBuilder()
		.setCustomId(`emoji_theme_${userId}`)
		.setLabel(lang.settings.mainPage.buttons.theme)
		.setStyle(ButtonStyle.Secondary)
		.setEmoji(getComponentEmoji(getEmojiMapForUser(userId), '1039'));
}

/**
 * Creates the emoji theme container with all buttons and content
 * @param {string} userId
 * @param {Object} lang
 * @param {Object} adminData
 * @param {string} successMessage - Optional success message to display at top
 * @param {number} accentColor - Optional accent color (default: 0x8e44ad)
 * @returns {Array}
 */
function createEmojiThemeContainer(userId, lang, adminData) {
	const hasFullPermissions = hasPermission(adminData, PERMISSIONS.FULL_ACCESS);
	const tc = lang.settings.theme.mainPage.content;

	let actionRows;
	let contentText;

	if (hasFullPermissions) {
		const actionRow1 = new ActionRowBuilder().addComponents(
			createEmojiCreateButton(userId, lang),
			createEmojiEditButton(userId, lang),
			createEmojiViewButton(userId, lang),
			createEmojiTemplateButton(userId, lang)
		);
		const actionRow2 = new ActionRowBuilder().addComponents(
			createEmojiDeleteButton(userId, lang),
			createEmojiReloadButton(userId, lang),
			createEmojiActivateButton(userId, lang),
			createBackToSettingsButton(userId, lang)
		);
		actionRows = [actionRow1, actionRow2];

		contentText =
			`${tc.title}\n` +
			`${tc.description}\n` +
			`${tc.addPackField.name}\n${tc.addPackField.value}\n` +
			`${tc.editPackField.name}\n${tc.editPackField.value}\n` +
			`${tc.viewPackField.name}\n${tc.viewPackField.value}\n` +
			`${tc.templateLibraryField.name}\n${tc.templateLibraryField.value}\n` +
			`${tc.deletePackField.name}\n${tc.deletePackField.value}\n` +
			`${tc.reloadDefaultsField.name}\n${tc.reloadDefaultsField.value}\n` +
			`${tc.activatePackField.name}\n${tc.activatePackField.value}\n`;
	} else {
		actionRows = [
			new ActionRowBuilder().addComponents(
				createEmojiActivateButton(userId, lang),
				createEmojiViewButton(userId, lang),
				createBackToSettingsButton(userId, lang)
			)
		];

		contentText =
			`${tc.title}\n` +
			`${tc.description}\n` +
			`${tc.viewPackField.name}\n${tc.viewPackField.value}\n` +
			`${tc.activatePackField.name}\n${tc.activatePackField.value}\n`;
	}

	return [
		new ContainerBuilder()
			.setAccentColor(0x8e44ad)
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(contentText)
			)
			.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
			)
			.addActionRowComponents(...actionRows)
	];
}

/**
 * Handles emoji theme button
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleEmojiThemeButton(interaction) {
	const { adminData, lang } = getUserInfo(interaction.user.id);
	try {
		const expectedUserId = interaction.customId.split('_')[2];
		if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

		const components = createEmojiThemeContainer(interaction.user.id, lang, adminData);

		await interaction.update({
			components,
			flags: MessageFlags.IsComponentsV2
		});
	} catch (error) {
		await handleError(interaction, lang, error, 'handleEmojiThemeButton');
	}
}

module.exports = {
	createEmojiThemeButton,
	handleEmojiThemeButton,
	createEmojiThemeContainer
};
