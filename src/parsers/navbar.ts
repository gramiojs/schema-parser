import type { CheerioAPI } from "cheerio";

export interface NavItem {
	text: string;
	href: string;
	children: NavItem[];
}

export function parseNavigation($: CheerioAPI): NavItem[] {
	const menu: NavItem[] = [];
	let lastParent: NavItem | null = null;

	$("a.anchor").each((index, anchor) => {
		const $anchor = $(anchor);
		const parent = $anchor.parent();
		const parentTag = parent[0].tagName.toLowerCase();
		const matches = parentTag.match(/^h([34])$/i);
		const anchorName = $anchor.attr("name");

		if (!matches || !anchorName) return;

		const level = Number.parseInt(matches[1], 10);
		const linkText = parent
			.contents()
			.eq(parent.contents().index($anchor) + 1)
			.text()
			.trim();

		const navItem: NavItem = {
			text: linkText,
			href: `#${anchorName}`,
			children: [],
		};

		if (level === 3) {
			menu.push(navItem);
			lastParent = navItem;
		} else if (level === 4 && lastParent) {
			lastParent.children.push(navItem);
		}
	});

	return menu.filter((item) => item.children.length > 0 || menu.length === 1);
}
