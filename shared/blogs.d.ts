export interface Blog {
  id: string;
  num: number;
  name: string;
  url: string;
  feed: string;
  tags: string[];
  dead: boolean;
  reason: string;
  fresh: number;
}

export interface CatalogStats {
  total: number;
  dead: number;
  tagged: number;
  matchedInReadme: number;
}

export interface Catalog {
  generatedAt: string;
  source: string;
  stats: CatalogStats;
  blogs: Blog[];
}

export interface CategoryDef {
  id: string;
  name: string;
  re: RegExp;
}

export function categorize(tags: string[]): string[];
export function blogId(url: string): string;
export function parseCsv(text: string): Pick<Blog, 'name' | 'url' | 'feed' | 'tags'>[];
export function parseReadme(text: string): {
  active: { name: string; url: string; feed: string; tags: string[] }[];
  dead: { name: string; url: string; reason: string }[];
};
export function buildCatalog(input: {
  csvText: string;
  readmeText: string;
  generatedAt?: string;
}): Catalog;

export const CATEGORIES: CategoryDef[];
