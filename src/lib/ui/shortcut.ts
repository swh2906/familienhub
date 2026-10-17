// Tastenkürzel für die wichtigste Aktion einer Seite (z. B. N für „Neu“).
// Als Svelte-Attachment direkt am Button/Feld: {@attach shortcut('n')}. Setzt aria-keyshortcuts,
// damit Screenreader das Kürzel ansagen.
import type { Attachment } from 'svelte/attachments';

export interface KeyInfo {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	repeat: boolean;
	defaultPrevented: boolean;
	/** Fokus liegt in einem Eingabefeld (dort wird normal getippt). */
	typing: boolean;
	/** Ein modaler Dialog ist offen (das Kürzel gilt nur für die Seite dahinter). */
	dialogOpen: boolean;
}

/** Löst das Kürzel aus? Nur die nackte Taste, nicht beim Tippen oder hinter einem Dialog. */
export function matchesShortcut(event: KeyInfo, key: string): boolean {
	if (event.ctrlKey || event.metaKey || event.altKey) return false;
	if (event.repeat || event.defaultPrevented || event.typing || event.dialogOpen) return false;
	return event.key.toLowerCase() === key.toLowerCase();
}

function isTyping(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.isContentEditable ||
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement
	);
}

/** Buttons und Links werden ausgelöst, Eingabefelder fokussiert. */
export function shortcut(key: string): Attachment<HTMLElement> {
	return (node) => {
		node.setAttribute('aria-keyshortcuts', key.toUpperCase());
		function onKeydown(event: KeyboardEvent) {
			const info: KeyInfo = {
				key: event.key,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				altKey: event.altKey,
				repeat: event.repeat,
				defaultPrevented: event.defaultPrevented,
				typing: isTyping(event.target),
				dialogOpen: document.querySelector('dialog[open]') !== null
			};
			if (!matchesShortcut(info, key)) return;
			event.preventDefault();
			if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) node.focus();
			else node.click();
		}
		window.addEventListener('keydown', onKeydown);
		return () => {
			window.removeEventListener('keydown', onKeydown);
			node.removeAttribute('aria-keyshortcuts');
		};
	};
}
