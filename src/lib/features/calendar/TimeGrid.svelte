<script lang="ts">
	// Zeitachse für einen oder mehrere Tage: ganztägige Termine oben, Termine nach Uhrzeit,
	// überlappende nebeneinander. Klick auf eine freie Stelle legt dort einen Termin an.
	// Termine ziehen (Maus sofort, Touch nach langem Drücken): verschieben, unterer Rand = Dauer.
	import { onMount, untrack } from 'svelte';
	import type { Membership } from '#lib/db/types.js';
	import { formatShortDate, formatWeekday } from '#lib/features/meals/week.js';
	import { m } from '#lib/paraglide/messages.js';
	import { layoutColumns } from './conflicts.js';
	import {
		COMPACT_MINUTES,
		HOUR_PX,
		initialScrollTop,
		minutesToTime,
		moveTo,
		resizeTo,
		slotGeometry,
		snapMinutes,
		type DragResult
	} from './grid.js';
	import { onDay, type Occurrence } from './expand.js';
	import { describeOccurrence, occurrenceColor, timeRange } from './label.js';
	import { utcToZoned } from './tz.js';

	let {
		days,
		occurrences,
		conflicts,
		members,
		today,
		timeZone,
		onopen,
		oncreate,
		onmove
	}: {
		days: string[];
		occurrences: Occurrence[];
		conflicts: ReadonlySet<string>;
		members: ReadonlyMap<string, Membership>;
		today: string;
		timeZone: string;
		onopen?: (o: Occurrence) => void;
		oncreate?: (date: string, time: string) => void;
		/** Termin gezogen (nur für Bearbeitende gesetzt). */
		onmove?: (o: Occurrence, result: DragResult) => void;
	} = $props();

	const hours = Array.from({ length: 24 }, (_, h) => h);
	let scroller: HTMLDivElement | undefined = $state();
	let now = $state(Date.now());

	// Beim Öffnen und beim Blättern: heute → aktuelle Uhrzeit im oberen Drittel, sonst 6:30.
	$effect(() => {
		const key = days.join(',');
		untrack(() => {
			if (!scroller || !key) return;
			const zoned = utcToZoned(Date.now(), timeZone);
			scroller.scrollTop = initialScrollTop(
				days.includes(zoned.date),
				zoned.minutes,
				scroller.clientHeight
			);
		});
	});

	onMount(() => {
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});

	const nowZoned = $derived(utcToZoned(now, timeZone));

	/** Zeitlich platzierte Termine eines Tages (auf den Tag zugeschnitten). */
	function placed(day: string) {
		const timed = onDay(occurrences, day).filter((o) => !o.allDay);
		return layoutColumns(timed).map((p) => {
			const o = p.occurrence;
			const start = o.startDate === day ? toMinutes(o.startTime) : 0;
			const end = o.endDate === day ? toMinutes(o.endTime) : 24 * 60;
			return { ...p, top: start, height: Math.max(end - start, 20) };
		});
	}

	function toMinutes(time: string): number {
		const [h, mi] = time.split(':').map(Number);
		return h * 60 + mi;
	}

	// ---- Ziehen ----
	const LONG_PRESS_MS = 350;
	interface Drag {
		o: Occurrence;
		mode: 'move' | 'resize';
		pointerId: number;
		touch: boolean;
		x: number;
		y: number;
		dayIndex: number;
		start: number;
		duration: number;
		colWidth: number;
		active: boolean;
		deltaMin: number;
		dayOffset: number;
		timer: ReturnType<typeof setTimeout> | null;
	}
	let drag: Drag | null = $state.raw(null);
	// Nach dem Ziehen kommt noch ein „click“ – der soll keinen Dialog öffnen.
	let suppressClick = false;

	/** Nur Termine innerhalb eines Tages lassen sich ziehen. */
	function draggable(o: Occurrence): boolean {
		return !!onmove && !o.allDay && o.startDate === o.endDate;
	}

	function result(d: Drag): DragResult {
		return d.mode === 'move'
			? moveTo(days[d.dayIndex + d.dayOffset], d.start, d.duration, d.deltaMin)
			: resizeTo(days[d.dayIndex], d.start, d.duration, d.deltaMin);
	}

	function pointerDown(event: PointerEvent, o: Occurrence, mode: 'move' | 'resize', day: string) {
		if (!draggable(o) || event.button !== 0) return;
		if (mode === 'resize') event.stopPropagation();
		const target = event.currentTarget as HTMLElement;
		const column = target.closest('.column');
		const d: Drag = {
			o,
			mode,
			pointerId: event.pointerId,
			touch: event.pointerType !== 'mouse',
			x: event.clientX,
			y: event.clientY,
			dayIndex: days.indexOf(day),
			start: toMinutes(o.startTime),
			duration: Math.max(15, Math.round((o.end - o.start) / 60_000)),
			colWidth: column?.getBoundingClientRect().width ?? 0,
			active: false,
			deltaMin: 0,
			dayOffset: 0,
			timer: null
		};
		if (d.touch) {
			// Touch: erst nach langem Drücken ziehen, sonst scrollt man wie gewohnt.
			d.timer = setTimeout(() => {
				if (drag !== d) return;
				drag = { ...d, active: true };
				navigator.vibrate?.(10);
			}, LONG_PRESS_MS);
		}
		drag = d;
		// Am ganzen Fenster mithören: Der Zeiger verlässt den Termin beim Ziehen schnell.
		window.addEventListener('pointermove', pointerMove);
		window.addEventListener('pointerup', pointerUp);
		window.addEventListener('pointercancel', cancelDrag);
	}

	function stopListening() {
		window.removeEventListener('pointermove', pointerMove);
		window.removeEventListener('pointerup', pointerUp);
		window.removeEventListener('pointercancel', cancelDrag);
	}

	function pointerMove(event: PointerEvent) {
		const d = drag;
		if (!d || event.pointerId !== d.pointerId) return;
		const dx = event.clientX - d.x;
		const dy = event.clientY - d.y;
		if (!d.active) {
			if (d.touch) {
				// Vor dem langen Drücken bewegt: das ist Scrollen, kein Ziehen.
				if (Math.hypot(dx, dy) > 8) cancelDrag();
				return;
			}
			if (Math.hypot(dx, dy) < 4) return;
		}
		const maxOffset = days.length - 1 - d.dayIndex;
		const dayOffset =
			d.mode === 'move' && days.length > 1 && d.colWidth > 0
				? Math.min(Math.max(Math.round(dx / d.colWidth), -d.dayIndex), maxOffset)
				: 0;
		drag = { ...d, active: true, deltaMin: snapMinutes(dy), dayOffset };
	}

	function pointerUp(event: PointerEvent) {
		const d = drag;
		if (!d || event.pointerId !== d.pointerId) return;
		if (d.timer) clearTimeout(d.timer);
		drag = null;
		stopListening();
		if (!d.active) return;
		suppressClick = true;
		setTimeout(() => (suppressClick = false), 0);
		const next = result(d);
		if (next.date !== d.o.startDate || next.start !== d.start || next.duration !== d.duration) {
			onmove?.(d.o, next);
		}
	}

	function cancelDrag() {
		if (drag?.timer) clearTimeout(drag.timer);
		drag = null;
		stopListening();
	}

	onMount(() => stopListening);

	/** Während des Ziehens auf Touch nicht scrollen (passive: false nötig). */
	function blockScroll(node: HTMLElement) {
		const onTouchMove = (event: TouchEvent) => {
			if (drag?.active) event.preventDefault();
		};
		node.addEventListener('touchmove', onTouchMove, { passive: false });
		return () => node.removeEventListener('touchmove', onTouchMove);
	}

	/** Vorschau-Uhrzeit während des Ziehens. */
	function preview(o: Occurrence): string | null {
		if (!drag?.active || drag.o.key !== o.key) return null;
		const r = result(drag);
		return `${minutesToTime(r.start)}–${minutesToTime((r.start + r.duration) % (24 * 60))}`;
	}

	function createAt(event: MouseEvent, day: string) {
		if (!oncreate || event.target !== event.currentTarget) return;
		const y = event.offsetY;
		const minutes = Math.floor(y / HOUR_PX) * 60 + (y % HOUR_PX >= HOUR_PX / 2 ? 30 : 0);
		const h = String(Math.floor(minutes / 60)).padStart(2, '0');
		const mi = String(minutes % 60).padStart(2, '0');
		oncreate(day, `${h}:${mi}`);
	}
</script>

<div class="grid" style:--days={days.length}>
	{#if days.length > 1}
		<div class="head" aria-hidden="true">
			<span></span>
			{#each days as day (day)}
				<span class="dayname" class:today={day === today}>
					<strong>{formatWeekday(day).slice(0, 2)}</strong>
					{formatShortDate(day)}
				</span>
			{/each}
		</div>
	{/if}

	<div class="allday">
		<span class="label">{m.cal_all_day()}</span>
		{#each days as day (day)}
			<div class="allday-cell">
				{#each onDay(occurrences, day).filter((o) => o.allDay) as o (o.key)}
					{@render chip(o, true)}
				{/each}
			</div>
		{/each}
	</div>

	<!-- Fokussierbar, damit man die Zeitachse auch per Tastatur scrollen kann. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="scroller"
		bind:this={scroller}
		tabindex="0"
		role="region"
		aria-label={m.cal_timeline()}
	>
		<div class="body" style:height="calc({24 * HOUR_PX}px + var(--pad))">
			<div class="hours" aria-hidden="true">
				{#each hours as h (h)}
					<span style:top="{h * HOUR_PX}px">{String(h).padStart(2, '0')}:00</span>
				{/each}
			</div>
			{#each days as day (day)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					class="column"
					class:today={day === today}
					onclick={(e) => createAt(e, day)}
					{@attach blockScroll}
				>
					{#each placed(day) as p (p.occurrence.key)}
						{@const dragging = drag?.active && drag.o.key === p.occurrence.key ? drag : null}
						<div
							class="slot"
							class:dragging
							style:top="{(p.top / 60) * HOUR_PX}px"
							style:height="{((p.height + (dragging?.mode === 'resize' ? dragging.deltaMin : 0)) /
								60) *
								HOUR_PX}px"
							style:left="{slotGeometry(p.column, p.columns).left}%"
							style:width="{slotGeometry(p.column, p.columns).width}%"
							style:z-index={dragging ? 5 : p.column + 1}
							style:transform={dragging?.mode === 'move'
								? `translate(${dragging.dayOffset * dragging.colWidth}px, ${(dragging.deltaMin / 60) * HOUR_PX}px)`
								: undefined}
						>
							{@render chip(p.occurrence, false, day, p.height < COMPACT_MINUTES)}
						</div>
					{/each}
					{#if day === nowZoned.date}
						<div class="now" style:top="{(nowZoned.minutes / 60) * HOUR_PX}px"></div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

{#snippet chip(o: Occurrence, allDay: boolean, day = '', compact = false)}
	{@const conflict = conflicts.has(o.key)}
	{@const label = describeOccurrence(o, members, conflict)}
	{#if onopen}
		<button
			type="button"
			class="event"
			class:allday-event={allDay}
			class:compact
			class:conflict
			style:--event-color={occurrenceColor(o, members)}
			class:draggable={!allDay && draggable(o)}
			aria-label={label}
			title={label}
			onclick={() => {
				if (!suppressClick) onopen?.(o);
			}}
			onpointerdown={(e) => !allDay && pointerDown(e, o, 'move', day)}
			oncontextmenu={(e) => !allDay && draggable(o) && e.preventDefault()}
		>
			{@render text(o, conflict)}
		</button>
		{#if !allDay && draggable(o)}
			<!-- Unterer Rand: Dauer ändern (nur Zeigegerät; per Tastatur im Dialog). -->
			<span
				class="resize"
				aria-hidden="true"
				onpointerdown={(e) => pointerDown(e, o, 'resize', day)}
			></span>
		{/if}
	{:else}
		<div
			class="event"
			class:allday-event={allDay}
			class:compact
			class:conflict
			style:--event-color={occurrenceColor(o, members)}
			title={label}
		>
			{@render text(o, conflict)}
		</div>
	{/if}
{/snippet}

{#snippet text(o: Occurrence, conflict: boolean)}
	<span class="event-title"
		>{#if conflict}⚠
		{/if}{o.event.title}</span
	>
	{#if !o.allDay}<span class="event-time">{preview(o) ?? timeRange(o)}</span>{/if}
{/snippet}

<style>
	.grid {
		--label: 3.75rem;
		/* Luft über 0 Uhr, damit die oberste Uhrzeit (mittig auf ihrer Linie) nicht abgeschnitten wird. */
		--pad: 0.625rem;
		display: grid;
		overflow: hidden;
		border-radius: var(--radius-card);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	/* Kopf, Ganztags-Zeile und Zeitachse reservieren gleich viel Platz für die Scrollleiste,
	   sonst sind die Spalten unten (mit Scrollleiste) schmaler als oben. */
	.head,
	.allday {
		overflow-y: hidden;
		scrollbar-gutter: stable;
		display: grid;
		grid-template-columns: var(--label) repeat(var(--days), minmax(0, 1fr));
		border-bottom: 1px solid var(--color-border);
	}

	.dayname {
		padding: var(--space-2) var(--space-1);
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		text-align: center;
	}

	.dayname strong {
		color: var(--color-text);
		margin-right: 2px;
	}

	.dayname.today strong {
		color: var(--color-primary-strong);
	}

	.allday .label {
		align-self: center;
		padding: 0 var(--space-2) 0 2px;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		text-align: right;
	}

	.allday-cell {
		display: grid;
		gap: 2px;
		align-content: start;
		min-height: 2rem;
		padding: 2px;
		border-left: 1px solid var(--color-border);
	}

	.scroller {
		max-height: min(68dvh, 40rem);
		overflow-y: auto;
		scrollbar-gutter: stable;
	}

	.body {
		position: relative;
		display: grid;
		grid-template-columns: var(--label) repeat(var(--days), minmax(0, 1fr));
		padding-top: var(--pad);
	}

	.hours {
		position: relative;
	}

	.hours span {
		position: absolute;
		right: var(--space-2);
		/* Mittig auf der Stundenlinie. */
		transform: translateY(-50%);
		line-height: 1;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
	}

	/* Stundenlinien nur in den Tagesspalten, damit sie die Uhrzeiten links nicht durchstreichen. */
	.column {
		position: relative;
		border-left: 1px solid var(--color-border);
		background-image: linear-gradient(var(--color-border) 1px, transparent 1px);
		background-size: 100% 48px;
	}

	.column.today {
		background-color: color-mix(in srgb, var(--color-primary-soft) 35%, transparent);
	}

	.slot {
		position: absolute;
		padding: 1px 2px;
	}

	.slot.dragging {
		z-index: 5;
		opacity: 0.9;
		filter: drop-shadow(0 6px 12px rgb(0 0 0 / 0.25));
	}

	.event.draggable {
		cursor: grab;
		touch-action: pan-y;
		-webkit-touch-callout: none;
		user-select: none;
	}

	.slot.dragging .event {
		cursor: grabbing;
	}

	/* Griff am unteren Rand: sichtbar als kurzer Strich, Fläche 10 px hoch. */
	.resize {
		position: absolute;
		left: 2px;
		right: 2px;
		bottom: 0;
		height: 10px;
		cursor: ns-resize;
		touch-action: none;
	}

	.resize::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 3px;
		width: 18px;
		height: 3px;
		border-radius: 2px;
		background: var(--event-color, var(--color-border));
		opacity: 0;
		transform: translateX(-50%);
	}

	.slot:hover .resize::after,
	.slot.dragging .resize::after {
		opacity: 0.7;
	}

	.event {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-height: 20px;
		overflow: hidden;
		padding: 2px var(--space-1);
		border: 0;
		border-left: 3px solid var(--event-color);
		border-radius: 6px;
		background: var(--color-calendar-bg);
		color: var(--color-text);
		font: inherit;
		font-size: 0.75rem;
		line-height: 1.25;
		text-align: left;
	}

	button.event {
		cursor: pointer;
	}

	button.event:hover {
		filter: brightness(0.97);
	}

	.allday-event {
		height: auto;
		min-height: 24px;
		justify-content: center;
	}

	.event.conflict {
		box-shadow: inset 0 0 0 2px var(--color-warning);
	}

	/* Titel nur an Wortgrenzen umbrechen (kein „Schwi-mmkurs“), zu Langes endet mit „…“. */
	.event-title {
		display: -webkit-box;
		overflow: hidden;
		font-weight: 650;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		text-overflow: ellipsis;
	}

	/* Kurze Termine: eine Zeile, Titel zuerst; bei wenig Platz wird zuerst die Uhrzeit gekürzt
	   (voller Text im Tooltip und für Screenreader). */
	.event.compact {
		flex-direction: row;
		align-items: baseline;
		gap: 4px;
	}

	.event.compact .event-title {
		display: block;
		flex: none;
		max-width: 100%;
		white-space: nowrap;
	}

	.event.compact .event-time {
		flex: 1 1 0;
		min-width: 0;
	}

	.event-time {
		overflow: hidden;
		color: var(--color-calendar);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	/* Jetzt-Linie: eigene Farbe (nicht die der Überschneidungen), hinter den Terminen. */
	.now {
		position: absolute;
		left: 0;
		right: 0;
		z-index: 0;
		height: 2px;
		background: var(--color-danger);
		pointer-events: none;
	}

	.now::before {
		content: '';
		position: absolute;
		left: -4px;
		top: -3px;
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--color-danger);
	}
</style>
