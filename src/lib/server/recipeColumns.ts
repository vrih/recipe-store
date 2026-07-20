/** The recipe fields shared by every write path (create/update/import), camelCase. */
export interface RecipeFields {
	title: string;
	text: string;
	yield: string;
	prepTime: string;
	cookTime: string;
	totalTime: string;
	ingredients: string;
	instructions: string;
	notes: string;
	nutrition: string;
	link: string;
	favorite: boolean;
	wantToCook: boolean;
}

/** Map camelCase recipe fields to the `recipes` table's snake_case columns. */
export function recipeColumnParams(fields: RecipeFields) {
	return {
		title: fields.title,
		text: fields.text,
		yield: fields.yield,
		prep_time: fields.prepTime,
		cook_time: fields.cookTime,
		total_time: fields.totalTime,
		ingredients: fields.ingredients,
		instructions: fields.instructions,
		notes: fields.notes,
		nutrition: fields.nutrition,
		link: fields.link,
		favorite: fields.favorite ? 1 : 0,
		want_to_cook: fields.wantToCook ? 1 : 0
	};
}
