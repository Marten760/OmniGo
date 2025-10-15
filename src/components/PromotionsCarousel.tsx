import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ArrowRight, Loader2 } from "lucide-react";

interface PromotionsCarouselProps {
  onStoreSelect: (id: Id<"stores">) => void;
  filters: any;
  country: string;
  region: string;
}

export function PromotionsCarousel({ onStoreSelect, filters, country, region }: PromotionsCarouselProps) {
  const promotions = useQuery(api.promotions.getActivePromotions, {
    storeType: filters.storeType,
    categories: filters.cuisine,
    country: country,
    region: region,
  });

  if (promotions === undefined) {
    return (
      <div className="h-48 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (promotions.length === 0) {
    return null; // Don't show the section if there are no active promotions
  }

  return (
    <div className="mb-8">
      <div className="flex items-center space-x-2 mb-4">
        <h2 className="text-2xl font-bold text-white">Special Offers</h2>
      </div>
      <div className="flex space-x-4 overflow-x-auto pb-4 -mb-4 scrollbar-hide">
        {promotions.map((promo) => (
          <div
            key={promo._id}
            onClick={() => onStoreSelect(promo.targetStoreId)}            className="relative w-64 sm:w-80 h-36 sm:h-48 flex-shrink-0 rounded-2xl overflow-hidden cursor-pointer group"
          >
            <img src={promo.imageUrl!} alt={promo.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 p-4 text-white">
              <h3 className="font-bold text-lg">{promo.title}</h3>
              {promo.description && <p className="text-sm text-gray-300">{promo.description}</p>}
            </div>
            {promo.badgeText && (
              <div className="absolute top-3 right-3 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                {promo.badgeText}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
