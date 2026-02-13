import { AssetView } from "@/components/dashboard/AssetView";
import { Header } from "@/components/layout/Header";

export default function Home() {
  return (
    <div className="min-h-screen bg-toss-grey-50 dark:bg-black">
      <Header title="홈" />
      <AssetView />
    </div>
  );
}
