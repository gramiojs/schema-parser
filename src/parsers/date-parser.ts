export interface DateObject {
	year: number;
	month: number;
	day: number;
}

const MONTHS = [
	"january",
	"february",
	"march",
	"april",
	"may",
	"june",
	"july",
	"august",
	"september",
	"october",
	"november",
	"december",
] as const;

export function parseDateString(dateString: string): DateObject {
	const parts = dateString.toLowerCase().split("-");

	if (parts.length !== 3) {
		throw new Error(
			`Invalid date format. Expected month-day-year but got ${dateString}`,
		);
	}

	const [monthName, dayStr, yearStr] = parts;
	const monthIndex = MONTHS.indexOf(monthName as (typeof MONTHS)[number]);

	if (monthIndex === -1) {
		throw new Error(`Invalid month name: ${monthName}`);
	}

	const day = Number.parseInt(dayStr, 10);
	const year = Number.parseInt(yearStr, 10);

	if (Number.isNaN(day) || Number.isNaN(year)) {
		throw new Error("Invalid numeric value in date");
	}

	return {
		year,
		month: monthIndex + 1,
		day,
	};
}
