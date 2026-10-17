// Kategorie-Vorschlag für Einkaufsartikel: zuerst aus früheren Einträgen des Haushalts,
// sonst aus einer kleinen Stichwortliste. Deutsche Komposita („Hafermilch“, „Olivenöl“) haben das
// Grundwort am Ende, deshalb wird überall im Namen gesucht; das längste passende Stichwort gewinnt
// („Kokosmilch“ → Konserven statt Kühlregal, „Thunfisch“ → Konserven statt Fleisch & Fisch).
import type { ShoppingItem } from '#lib/db/types.js';
import { normalize } from '#lib/features/meals/recipes.js';

const KEYWORDS: Record<string, string[]> = {
	'Obst & Gemüse': [
		'apfel',
		'äpfel',
		'banane',
		'birne',
		'orange',
		'mandarine',
		'zitrone',
		'limette',
		'traube',
		'erdbeer',
		'himbeer',
		'heidelbeer',
		'beeren',
		'kiwi',
		'mango',
		'ananas',
		'melone',
		'pfirsich',
		'tomate',
		'gurke',
		'paprika',
		'zucchini',
		'karotte',
		'möhre',
		'kartoffel',
		'zwiebel',
		'knoblauch',
		'salat',
		'spinat',
		'brokkoli',
		'blumenkohl',
		'kohl',
		'lauch',
		'porree',
		'pilz',
		'champignon',
		'avocado',
		'ingwer',
		'petersilie',
		'basilikum',
		'schnittlauch',
		'radieschen',
		'sellerie',
		'aubergine',
		'kürbis',
		'süßkartoffel',
		'rucola',
		'obst',
		'gemüse'
	],
	'Brot & Backwaren': [
		'brot',
		'brötchen',
		'toast',
		'baguette',
		'croissant',
		'brezel',
		'laugen',
		'knäcke',
		'wrap',
		'tortilla',
		'semmel'
	],
	Kühlregal: [
		'milch',
		'joghurt',
		'quark',
		'sahne',
		'butter',
		'käse',
		'mozzarella',
		'feta',
		'frischkäse',
		'schmand',
		'eier',
		'margarine',
		'tofu',
		'hefe',
		'aufschnitt',
		'schinken',
		'skyr',
		'pudding'
	],
	'Fleisch & Fisch': [
		'hack',
		'hähnchen',
		'huhn',
		'pute',
		'rind',
		'schwein',
		'steak',
		'wurst',
		'würstchen',
		'lachs',
		'fisch',
		'garnelen',
		'speck',
		'schnitzel',
		'salami'
	],
	Trockenware: [
		'nudel',
		'spaghetti',
		'pasta',
		'penne',
		'reis',
		'mehl',
		'zucker',
		'haferflocken',
		'müsli',
		'linsen',
		'couscous',
		'bulgur',
		'quinoa',
		'grieß',
		'backpulver',
		'paniermehl',
		'cornflakes',
		'lasagneplatten',
		'nüsse',
		'mandeln'
	],
	Konserven: [
		'dose',
		'passierte',
		'tomatenmark',
		'kichererbsen',
		'bohnen',
		'thunfisch',
		'kokosmilch',
		'oliven',
		'mais',
		'gewürzgurken',
		'sauerkraut'
	],
	'Gewürze & Öle': [
		'salz',
		'pfeffer',
		'öl',
		'olivenöl',
		'essig',
		'gewürz',
		'paprikapulver',
		'curry',
		'zimt',
		'oregano',
		'senf',
		'ketchup',
		'mayo',
		'brühe',
		'sojasoße',
		'sojasauce',
		'honig'
	],
	Tiefkühl: ['pizza', 'eis', 'pommes', 'fischstäbchen', 'erbsen'],
	Getränke: [
		'wasser',
		'saft',
		'cola',
		'limo',
		'bier',
		'wein',
		'tee',
		'kaffee',
		'sprudel',
		'schorle',
		'kakao'
	],
	Süßes: [
		'schokolade',
		'schoko',
		'keks',
		'gummibär',
		'chips',
		'bonbon',
		'kuchen',
		'nutella',
		'marmelade',
		'süßigkeit'
	],
	Haushalt: [
		'spülmittel',
		'spüli',
		'waschmittel',
		'klopapier',
		'toilettenpapier',
		'küchenrolle',
		'müllbeutel',
		'schwamm',
		'seife',
		'zahnpasta',
		'shampoo',
		'taschentücher',
		'alufolie',
		'frischhaltefolie',
		'backpapier',
		'batterie',
		'spültabs',
		'weichspüler'
	]
};

// Vorab normalisiert und nach Länge sortiert (längstes Stichwort zuerst).
const INDEX = Object.entries(KEYWORDS)
	.flatMap(([category, words]) => words.map((word) => ({ word: normalize(word), category })))
	.sort((a, b) => b.word.length - a.word.length);

/** Kategorie aus der Stichwortliste oder '' (unbekannt). */
export function categoryFromKeywords(name: string): string {
	const text = normalize(name);
	// „TK …“ oder „tiefgekühlt“ ist eindeutig, egal was sonst im Namen steht („TK Spinat“).
	if (/(^|\s)tk(\s|$)/.test(text) || /tiefkuhl|tiefgekuhlt/.test(text)) return 'Tiefkühl';
	return INDEX.find(({ word }) => text.includes(word))?.category ?? '';
}

/**
 * Vorschlag: zuletzt im Haushalt gewählte Kategorie für denselben Artikel,
 * sonst Stichwortliste, sonst ''.
 */
export function suggestCategory(name: string, history: readonly ShoppingItem[]): string {
	const key = normalize(name);
	if (!key) return '';
	let best: ShoppingItem | undefined;
	for (const item of history) {
		if (!item.category || normalize(item.name) !== key) continue;
		const stamp = item.updated || item.created || '￿';
		const bestStamp = best ? best.updated || best.created || '￿' : '';
		if (!best || stamp > bestStamp) best = item;
	}
	return best?.category ?? categoryFromKeywords(name);
}
