import AppsDirectory, { type CatalogApp } from "@/components/AppsDirectory";
import catalog from "@/data/apps.json";

export const metadata = { title: "Apps · Open Dot" };

export default function Page() {
  return <AppsDirectory apps={catalog.apps as CatalogApp[]} />;
}
