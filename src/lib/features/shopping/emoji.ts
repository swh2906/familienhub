// Emoji für Einkaufs-Kacheln. Wie bei den Kategorien: überall im Namen suchen, längstes Stichwort
// gewinnt („Hafermilch“ → 🥛, „Kokosmilch“ → 🥥). Ohne Treffer: Emoji der Kategorie.
import { normalize } from '#lib/features/meals/recipes.js';

const EMOJI: [string, string[]][] = [
	['🍎', ['apfel', 'äpfel']],
	['🍐', ['birne']],
	['🍌', ['banane']],
	['🍊', ['orange', 'mandarine', 'clementine']],
	['🍋', ['zitrone', 'limette']],
	['🍇', ['traube', 'weintraube']],
	['🍓', ['erdbeer']],
	['🫐', ['heidelbeer', 'blaubeer', 'beeren']],
	['🍒', ['kirsche']],
	['🍑', ['pfirsich', 'nektarine']],
	['🥭', ['mango']],
	['🍍', ['ananas']],
	['🍉', ['melone']],
	['🥝', ['kiwi']],
	['🥥', ['kokos']],
	['🥑', ['avocado']],
	['🍅', ['tomate']],
	['🥒', ['gurke', 'zucchini']],
	['🫑', ['paprika']],
	['🥕', ['karotte', 'möhre']],
	['🥔', ['kartoffel']],
	['🍠', ['süßkartoffel']],
	['🧅', ['zwiebel']],
	['🧄', ['knoblauch']],
	['🥬', ['salat', 'spinat', 'kohl', 'mangold', 'rucola']],
	['🥦', ['brokkoli', 'blumenkohl']],
	['🌽', ['mais']],
	['🍄', ['pilz', 'champignon']],
	['🫛', ['erbsen', 'bohnen']],
	['🌶️', ['chili', 'peperoni']],
	['🫚', ['ingwer']],
	['🌿', ['petersilie', 'basilikum', 'schnittlauch', 'kräuter', 'dill', 'minze', 'koriander']],
	['🍞', ['brot', 'toast']],
	['🥖', ['baguette']],
	['🥐', ['croissant']],
	['🥨', ['brezel', 'laugen']],
	['🫓', ['wrap', 'tortilla', 'fladenbrot']],
	['🥯', ['brötchen', 'semmel']],
	['🥛', ['milch']],
	['🧈', ['butter', 'margarine']],
	['🧀', ['käse', 'mozzarella', 'feta', 'parmesan', 'gouda']],
	['🥚', ['eier', 'ei ']],
	['🫙', ['joghurt', 'quark', 'skyr', 'schmand', 'sahne', 'pudding']],
	['🥩', ['steak', 'rind', 'schwein', 'schnitzel', 'fleisch']],
	['🍗', ['hähnchen', 'huhn', 'pute', 'chicken']],
	['🥓', ['speck', 'bacon', 'schinken']],
	['🌭', ['wurst', 'würstchen', 'salami']],
	['🍖', ['hack']],
	['🐟', ['fisch', 'lachs', 'forelle', 'kabeljau']],
	['🦐', ['garnelen', 'shrimps']],
	['🍝', ['nudel', 'spaghetti', 'pasta', 'penne', 'lasagne']],
	['🍚', ['reis']],
	['🌾', ['mehl', 'haferflocken', 'müsli', 'grieß', 'couscous', 'bulgur', 'quinoa']],
	['🥣', ['cornflakes', 'cerealien']],
	['🧂', ['salz']],
	['🫗', ['öl', 'olivenöl', 'rapsöl', 'sonnenblumenöl', 'essig']],
	['🍯', ['honig', 'marmelade', 'nutella']],
	['🍬', ['zucker', 'bonbon', 'gummibär', 'süßigkeit']],
	['🍫', ['schokolade', 'schoko']],
	['🍪', ['keks', 'cookie']],
	['🍰', ['kuchen', 'torte']],
	['🍿', ['popcorn']],
	['🥔', ['chips']],
	['🥜', ['nüsse', 'erdnuss', 'mandeln', 'walnuss']],
	['🥫', ['dose', 'passierte', 'tomatenmark', 'kichererbsen', 'linsen', 'mais dose']],
	['🫒', ['oliven']],
	['🥒', ['gewürzgurken']],
	['🍕', ['pizza']],
	['🍦', ['eis ', 'eiscreme', 'vanilleeis']],
	['🍟', ['pommes']],
	['💧', ['wasser', 'sprudel']],
	['🧃', ['saft', 'schorle']],
	['🥤', ['cola', 'limo']],
	['🍺', ['bier']],
	['🍷', ['wein']],
	['☕', ['kaffee']],
	['🍵', ['tee']],
	['🧉', ['kakao']],
	['🌶️', ['pfeffer', 'gewürz', 'curry', 'paprikapulver', 'zimt', 'oregano']],
	['🟡', ['senf']],
	['🍅', ['ketchup']],
	['🫕', ['brühe', 'suppe']],
	['🧽', ['schwamm', 'spülmittel', 'spüli', 'spültabs']],
	['🧺', ['waschmittel', 'weichspüler']],
	['🧻', ['klopapier', 'toilettenpapier', 'küchenrolle']],
	['🧼', ['seife', 'duschgel']],
	['🪥', ['zahnpasta', 'zahnbürste']],
	['🧴', ['shampoo', 'creme', 'sonnencreme']],
	['🤧', ['taschentücher']],
	['🗑️', ['müllbeutel', 'mülltüten']],
	['🔋', ['batterie']],
	['🍼', ['babynahrung', 'babymilch']],
	['🧷', ['windeln']],
	['🐾', ['katzenfutter', 'hundefutter', 'tierfutter']],
	['💐', ['blumen']],
	['🎁', ['geschenk']]
];

const CATEGORY_EMOJI: Record<string, string> = {
	'Obst & Gemüse': '🥗',
	'Brot & Backwaren': '🍞',
	Kühlregal: '🧊',
	'Fleisch & Fisch': '🥩',
	Trockenware: '🌾',
	Konserven: '🥫',
	'Gewürze & Öle': '🧂',
	Tiefkühl: '❄️',
	Getränke: '🥤',
	Süßes: '🍬',
	Haushalt: '🧽'
};

const FALLBACK = '🛒';

const INDEX = EMOJI.flatMap(([emoji, words]) =>
	words.map((word) => ({ word: normalize(word) + (word.endsWith(' ') ? ' ' : ''), emoji }))
).sort((a, b) => b.word.length - a.word.length);

/** Emoji zu einem Artikel; Wörter mit Leerzeichen am Ende („ei “) gelten nur als ganzes Wort. */
export function emojiFor(name: string, category = ''): string {
	const text = ` ${normalize(name)} `;
	const match = INDEX.find(({ word }) =>
		word.endsWith(' ') ? text.includes(` ${word}`) : text.includes(word)
	);
	return match?.emoji ?? CATEGORY_EMOJI[category] ?? FALLBACK;
}
