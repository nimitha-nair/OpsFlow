export type SearchEntity = "task" | "project" | "user" | "expense" | "ticket";

export interface SearchResult {
  entity: SearchEntity;
  id: string;
  code?: string;
  title: string;
  subtitle?: string;
}

export const SEARCH_ENTITY_LABELS: Record<SearchEntity, string> = {
  task: "Tasks",
  project: "Projects",
  user: "People",
  expense: "Expenses",
  ticket: "Tickets",
};
