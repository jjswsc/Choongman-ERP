// Types
export interface Ingredient {
  code: number
  name: string
  bahtPerUnit: number
  category: "food" | "packaging"
}

export interface RecipeItem {
  ingredientCode: number
  quantity: number // g/unit or unit count
  misePercent?: number // 로스/미세 %, 기본 3
}

export interface MenuItem {
  itemNo: number
  category: string
  menuName: string
  description: string
  inclVat: number
  serviceType: "Dine-In" | "Delivery"
  deliveryPercent: number
  misePercent: number
}

// Ingredient database (the "other sheet")
export const ingredientDatabase: Ingredient[] = [
  // Food ingredients
  { code: 3, name: "Frozen Marinade BLK 27-35g /pcs.", bahtPerUnit: 3.75, category: "food" },
  { code: 5, name: "Choongman Batter Mix for Chicken", bahtPerUnit: 0.107, category: "food" },
  { code: 75, name: "Snow Onion Sauce", bahtPerUnit: 0.147, category: "food" },
  { code: 65, name: "Dried Parsley", bahtPerUnit: 1.38, category: "food" },
  { code: 16, name: "Onion", bahtPerUnit: 0.027, category: "food" },
  { code: 79, name: "Pickled Radish", bahtPerUnit: 0.06, category: "food" },
  { code: 135, name: "Oil BL", bahtPerUnit: 0.044, category: "food" },
  { code: 28, name: "Poki Kimchi Nongyee", bahtPerUnit: 0.042, category: "food" },
  { code: 10, name: "Garlic Powder", bahtPerUnit: 0.23, category: "food" },
  { code: 12, name: "Soy Sauce", bahtPerUnit: 0.055, category: "food" },
  { code: 15, name: "Sesame Oil", bahtPerUnit: 0.32, category: "food" },
  { code: 20, name: "Rice Flour", bahtPerUnit: 0.035, category: "food" },
  { code: 22, name: "Corn Starch", bahtPerUnit: 0.048, category: "food" },
  { code: 30, name: "Sugar", bahtPerUnit: 0.025, category: "food" },
  { code: 35, name: "Salt", bahtPerUnit: 0.012, category: "food" },
  { code: 40, name: "Black Pepper", bahtPerUnit: 0.45, category: "food" },
  { code: 45, name: "Chili Flakes", bahtPerUnit: 0.28, category: "food" },
  { code: 50, name: "Spring Onion", bahtPerUnit: 0.035, category: "food" },
  { code: 55, name: "Ginger", bahtPerUnit: 0.065, category: "food" },
  { code: 60, name: "Lettuce", bahtPerUnit: 0.042, category: "food" },

  // Packaging items
  { code: 116, name: "Chopsticks", bahtPerUnit: 0.34, category: "packaging" },
  { code: 235, name: "Spoon Set", bahtPerUnit: 0.55, category: "packaging" },
  { code: 234, name: "Choongman Box (XS)", bahtPerUnit: 4.0, category: "packaging" },
  { code: 109, name: "Take Away Bowl 4 oz", bahtPerUnit: 0.919, category: "packaging" },
  { code: 204, name: "Onion Plastic Packing", bahtPerUnit: 0.748, category: "packaging" },
  { code: 202, name: "Sauce Pouch Salad Sauce", bahtPerUnit: 0.467, category: "packaging" },
  { code: 210, name: "Paper Bag (M)", bahtPerUnit: 2.5, category: "packaging" },
  { code: 215, name: "Sticker Seal", bahtPerUnit: 0.15, category: "packaging" },
  { code: 220, name: "Napkin Pack", bahtPerUnit: 0.18, category: "packaging" },
  { code: 225, name: "Plastic Cup Lid", bahtPerUnit: 0.35, category: "packaging" },
]

export const MISE_DEFAULT = 3

// Sample recipe for Snow Onion (Size S)
export const sampleFoodRecipe: RecipeItem[] = [
  { ingredientCode: 3, quantity: 5.0, misePercent: MISE_DEFAULT },
  { ingredientCode: 5, quantity: 36.0, misePercent: MISE_DEFAULT },
  { ingredientCode: 75, quantity: 70.0, misePercent: MISE_DEFAULT },
  { ingredientCode: 65, quantity: 1.0, misePercent: MISE_DEFAULT },
  { ingredientCode: 16, quantity: 50.0, misePercent: MISE_DEFAULT },
  { ingredientCode: 79, quantity: 30.0, misePercent: MISE_DEFAULT },
  { ingredientCode: 135, quantity: 50.0, misePercent: MISE_DEFAULT },
  { ingredientCode: 28, quantity: 30.0, misePercent: MISE_DEFAULT },
]

export const samplePackagingRecipe: RecipeItem[] = [
  { ingredientCode: 116, quantity: 1.0, misePercent: MISE_DEFAULT },
  { ingredientCode: 234, quantity: 1.0, misePercent: MISE_DEFAULT },
  { ingredientCode: 109, quantity: 1.0, misePercent: MISE_DEFAULT },
  { ingredientCode: 204, quantity: 1.0, misePercent: MISE_DEFAULT },
  { ingredientCode: 202, quantity: 1.0, misePercent: MISE_DEFAULT },
]

export const sampleMenuItem: MenuItem = {
  itemNo: 90,
  category: "Size S",
  menuName: "Snow Onion (Size S)",
  description: "สโนว์อ้อเนี่ยน ไซส์ S",
  inclVat: 139.0,
  serviceType: "Dine-In",
  deliveryPercent: 25,
  misePercent: 3,
}

// Runtime ingredients (API 로드 시 사용)
let runtimeIngredientMap = new Map<number, { name: string; bahtPerUnit: number; category: "food" | "packaging" }>()

export function setRuntimeIngredients(items: Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging" }>) {
  runtimeIngredientMap = new Map(items.map((i) => [i.code, { name: i.name, bahtPerUnit: i.bahtPerUnit, category: i.category }]))
}

export function clearRuntimeIngredients() {
  runtimeIngredientMap = new Map()
}

export function getRuntimeIngredients(): Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging" }> {
  return Array.from(runtimeIngredientMap.entries()).map(([code, v]) => ({ code, ...v }))
}

// Helper functions
export function getIngredient(code: number): Ingredient | { code: number; name: string; bahtPerUnit: number } | undefined {
  const runtime = runtimeIngredientMap.get(code)
  if (runtime) return { code, ...runtime }
  return ingredientDatabase.find((i) => i.code === code)
}

export function calculateItemCost(item: RecipeItem): number {
  const ingredient = getIngredient(item.ingredientCode)
  if (!ingredient) return 0
  const baseCost = ingredient.bahtPerUnit * item.quantity
  const mise = item.misePercent ?? 3
  return Math.round(baseCost * (1 + mise / 100) * 100) / 100
}

export function calculateSubTotal(items: RecipeItem[]): number {
  return items.reduce((sum, item) => sum + calculateItemCost(item), 0)
}

export function calculateExclVat(inclVat: number): number {
  return inclVat / 1.07 // 7% VAT in Thailand
}

export function calculateMargin(exclVat: number, totalCost: number): number {
  return exclVat - totalCost
}

export function calculateMarginPercent(margin: number, exclVat: number): number {
  if (exclVat === 0) return 0
  return (margin / exclVat) * 100
}

export function calculateCostPercent(totalCost: number, exclVat: number): number {
  if (exclVat === 0) return 0
  return (totalCost / exclVat) * 100
}
