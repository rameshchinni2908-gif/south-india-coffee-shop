import { z } from "zod";

export const menuFilterFormSchema = z.object({
  search: z.string().trim().max(100),
  category: z.string(),
  available: z.enum(["all", "true", "false"]),
  vegetarian: z.enum(["all", "true", "false"]),
  sort: z.enum(["name-asc", "createdAt-desc", "updatedAt-desc"]),
});

export type MenuFilterForm = z.infer<typeof menuFilterFormSchema>;

export const getMenuFilterForm = (searchParams: URLSearchParams): MenuFilterForm => {
  const vegetarian = searchParams.get("vegetarian");
  const sort = searchParams.get("sort");
  const available = searchParams.get("available");
  const result = menuFilterFormSchema.safeParse({
    search: searchParams.get("search") ?? "",
    category: searchParams.get("category") ?? "",
    available: available === "true" || available === "false" ? available : "all",
    vegetarian: vegetarian === "true" || vegetarian === "false" ? vegetarian : "all",
    sort:
      sort === "createdAt-desc" || sort === "updatedAt-desc" || sort === "name-asc"
        ? sort
        : "name-asc",
  });

  return result.success
    ? result.data
    : {
        search: "",
        category: "",
        available: "all",
        vegetarian: "all",
        sort: "name-asc",
      };
};

export const getPage = (searchParams: URLSearchParams): number => {
  const parsedPage = Number(searchParams.get("page"));

  return Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
};
