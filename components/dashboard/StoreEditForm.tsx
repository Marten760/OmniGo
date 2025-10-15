import { useState, useMemo, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { Upload, Camera, X, Plus, Trash2, ChevronsUpDown, Check } from "lucide-react";
import { Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { worldLocations } from "../../data/worldLocations";
import { storeTypes, storeCategories } from "../../data/storeCategories";
import { OpeningHoursInput } from './OpeningHoursInput';

type StoreWithImageUrl = Doc<"stores"> & { imageUrl: string | null; galleryImageUrls?: (string | null)[] };

interface StoreEditFormProps {
  store: StoreWithImageUrl;
}

type GalleryItem = {
  type: 'current' | 'new';
  url: string;
  file?: File;
  id: string; // storageId for current, temp unique id for new
};

export function StoreEditForm({ store }: StoreEditFormProps) {
  const sessionToken = useMemo(() => localStorage.getItem("sessionToken"), []);
  const regions = worldLocations;
  const updateStore = useMutation(api.stores.updateStore);
  const generateUploadUrl = useMutation(api.stores.generateUploadUrl);

  const [formState, setFormState] = useState({
    name: store.name, 
    description: store.description,
    categories: store.categories,
    storeType: store.storeType,
    priceRange: store.priceRange,
    address: store.address,
    country: store.country,
    region: store.region,
    phone: store.phone || "",
    email: store.email || "",
    openingHours: store.openingHours, // This will now be an array of objects
    hasDelivery: store.hasDelivery,
    deliveryFee: store.deliveryFee || 0,
    deliveryTime: store.deliveryTime || "",
    dietaryOptions: store.dietaryOptions || [],
    hasOffer: store.hasOffer,
    offerText: store.offerText || "",
    logoImage: null as File | null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [isCountryPopoverOpen, setIsCountryPopoverOpen] = useState(false);

  // Initialize gallery items from store prop
  useEffect(() => {
    const initialItems = (store.galleryImageIds || []).map((id, index) => ({
      id: id,
      type: 'current' as const,
      url: store.galleryImageUrls?.[index] || '',
    })).filter(item => item.url); // Filter out items with no URL
    setGalleryItems(initialItems);
  }, [store.galleryImageIds, store.galleryImageUrls]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormState(prev => ({ ...prev, [name]: checked }));
  };

  const handleCategoryToggle = (category: string) => {
    setFormState(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const handleSingleImageUpload = async (file: File): Promise<Id<"_storage">> => {
    if (!sessionToken) {
      throw new Error("Authentication error: No session token found.");
    }
    const uploadUrl = await generateUploadUrl();
    const result = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!result.ok) {
      throw new Error("Failed to upload image");
    }
    const { storageId } = await result.json();
    return storageId as Id<"_storage">;
  };

  const handleMultipleImageUpload = async (files: File[]): Promise<Id<"_storage">[]> => {
    return Promise.all(files.map(file => handleSingleImageUpload(file)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // --- Validation Start ---
    if (formState.email && !/\S+@\S+\.\S+/.test(formState.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (formState.phone && !/^\+?[\d\s-()]{7,20}$/.test(formState.phone)) {
      toast.error("Please enter a valid phone number.");
      return;
    }
    // --- Validation End ---

    setIsSubmitting(true);
    try {
      let logoImageId: Id<"_storage"> | undefined = store.logoImageId ?? undefined;
      if (formState.logoImage) {
        logoImageId = await handleSingleImageUpload(formState.logoImage);
      }

      // Process gallery images
      const finalGalleryImageIds: Id<"_storage">[] = [];
      for (const item of galleryItems) {
        if (item.type === 'current') {
          finalGalleryImageIds.push(item.id as Id<"_storage">);
        } else if (item.type === 'new' && item.file) {
          const newId = await handleSingleImageUpload(item.file);
          finalGalleryImageIds.push(newId);
        }
      }


      if (!sessionToken) {
        toast.error("Authentication error. Please log in again.");
        return;
      }

      const { logoImage, ...formDataForMutation } = formState;
      
      await updateStore({
        storeId: store._id,
        ...formDataForMutation,
        deliveryFee: Number(formDataForMutation.deliveryFee),
        logoImageId: logoImageId,
        galleryImageIds: finalGalleryImageIds,
        tokenIdentifier: sessionToken,
      });

      toast.success(`"${formState.name}" updated successfully!`);
    } catch (error) {
      console.error("Update error:", error);
      toast.error(`Failed to update ${formState.name}. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewGalleryImages = (files: FileList | null) => {
    if (!files) return;
    const newItems: GalleryItem[] = Array.from(files).map(file => ({
      id: `${file.name}-${Date.now()}`, // Create a temporary unique ID
      type: 'new',
      url: URL.createObjectURL(file),
      file: file,
    }));
    setGalleryItems(prev => [...prev, ...newItems]);
  };



  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Logo Image Upload */}
      <div> 
        <label className="block text-sm font-medium text-gray-300 mb-2">Store Image</label>
        <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center">
          {formState.logoImage ? (
            <div className="space-y-2">
              <img src={URL.createObjectURL(formState.logoImage)} alt="New Preview" className="w-32 h-32 object-cover rounded-lg mx-auto" />
              <p className="text-green-400 text-sm">{formState.logoImage.name}</p>
              <button type="button" onClick={() => setFormState({ ...formState, logoImage: null })} className="text-red-400 hover:text-red-300 text-sm">Cancel</button>
            </div>
          ) : store.imageUrl ? (
             <div className="space-y-2">
                <img src={store.imageUrl} alt="Current Image" className="w-32 h-32 object-cover rounded-lg mx-auto" />
                <p className="text-gray-400 text-sm">Current image</p>
                <input type="file" accept="image/*" onChange={(e) => setFormState({ ...formState, logoImage: e.target.files?.[0] || null })} className="hidden" id="store-image-edit" />
                <label htmlFor="store-image-edit" className="text-purple-400 hover:text-purple-300 text-sm cursor-pointer">Change Image</label>
             </div>
          ) : (
            <div>
              <Camera className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-400 mb-2">Upload store image</p>
              <input type="file" accept="image/*" onChange={(e) => setFormState({ ...formState, logoImage: e.target.files?.[0] || null })} className="hidden" id="store-image-edit" />
              <label htmlFor="store-image-edit" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg cursor-pointer inline-flex items-center space-x-2">
                <Upload size={16} />
                <span>Choose Image</span>
              </label>
            </div>
          )}
        </div>
      </div>
      {/* Gallery Images Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Gallery Images</label>
        <div className="border-2 border-dashed border-gray-600 rounded-xl p-4">
          {galleryItems.length > 0 ? (            
            <Reorder.Group
              axis="x"
              values={galleryItems}
              onReorder={setGalleryItems}
              className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3"
            >
              {galleryItems.map((item, index) => (
                <Reorder.Item key={item.id} value={item} className="relative group aspect-square cursor-grab">
                  <img src={item.url} alt={`Preview ${index + 1}`} className="w-full h-full object-cover rounded-lg" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button type="button" onClick={() => setGalleryItems(prev => prev.filter(i => i.id !== item.id))} className="text-white p-1 bg-red-600/80 rounded-full">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </Reorder.Item>
              ))}
              <label htmlFor="gallery-images-edit" className="flex items-center justify-center aspect-square border-2 border-dashed border-gray-500 rounded-lg cursor-pointer hover:bg-gray-700/50">
                <Plus size={24} className="text-gray-400" />
              </label>
            </Reorder.Group>
          ) : (
            <div className="text-center p-6">
              <Camera className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-400 mb-2">Drag & drop images here, or click to upload</p>
              <label htmlFor="gallery-images-edit" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg cursor-pointer inline-flex items-center space-x-2">
                <Upload size={18} />
                <span>Choose Images</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Form fields are identical to StoreRegistrationForm, so I'll just copy them */} 
      {/* Name and Category */} 
      <input type="file" accept="image/*" multiple onChange={(e) => handleNewGalleryImages(e.target.files)} className="hidden" id="gallery-images-edit" /> 
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Store Name *</label>
          <input type="text" name="name" required value={formState.name} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2 text-white focus:border-purple-500 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Store Type *</label>
          <Select
            required
            value={formState.storeType}
            onValueChange={(value) => handleInputChange({ target: { name: 'storeType', value } } as React.ChangeEvent<HTMLSelectElement>)}
          >
            <SelectTrigger className="w-full bg-gray-700 border-gray-600 rounded-xl px-4 py-2 text-white focus:border-purple-500 focus:ring-purple-500 capitalize">
              <SelectValue placeholder="Select a store type" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-white">
              {Object.entries(storeTypes).map(([key, value]) => (
                <SelectItem key={key} value={key} className="capitalize cursor-pointer hover:bg-purple-500/20">{value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-300 mb-2">Categories * <span className="text-xs text-gray-400">(select all that apply)</span></label>
          <div className="flex flex-wrap gap-2 p-3 bg-gray-900/50 border border-gray-700 rounded-xl">
            {(storeCategories[formState.storeType as keyof typeof storeCategories] || []).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => handleCategoryToggle(cat)}
                className={`px-4 py-2 rounded-full text-sm transition-all duration-200 ${
                  formState.categories.includes(cat)
                    ? 'bg-purple-600 text-white shadow-lg'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Description *</label>
        <textarea name="description" required value={formState.description} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2 text-white focus:border-purple-500 focus:ring-purple-500" rows={3} />
      </div>

      {/* Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Country *</label>
          <Popover open={isCountryPopoverOpen} onOpenChange={setIsCountryPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={isCountryPopoverOpen}
                className="w-full justify-between bg-gray-700 border-gray-600 hover:bg-gray-600 text-white hover:text-white"
              >
                {formState.country || "Select country..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-gray-800 border-gray-700 text-white">
              <Command>
                <CommandInput placeholder="Search country..." className="h-9 border-gray-700 text-white" />
                <CommandEmpty>No country found.</CommandEmpty>
                <CommandGroup className="max-h-60 overflow-y-auto">
                  {Object.keys(regions).map((country) => (
                    <CommandItem
                      key={country}
                      value={country}
                      onSelect={(currentValue: string) => {
                        const newCountry = currentValue === formState.country ? "" : currentValue;
                        const newRegions = regions[newCountry as keyof typeof regions];
                        setFormState(prev => ({ ...prev, country: newCountry, region: newRegions ? newRegions[0] : "" }));
                        setIsCountryPopoverOpen(false);
                      }}
                    >
                      {country}
                      <Check className={`ml-auto h-4 w-4 ${formState.country === country ? "opacity-100" : "opacity-0"}`} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Region/City *</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between bg-gray-700 border-gray-600 hover:bg-gray-600 text-white hover:text-white" disabled={!regions[formState.country as keyof typeof regions]}>
                {formState.region || "Select region..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-gray-800 border-gray-700 text-white">
              <Command>
                <CommandInput placeholder="Search region..." className="h-9 border-gray-700 text-white" />
                <CommandEmpty>No region found.</CommandEmpty>
                <CommandGroup className="max-h-60 overflow-y-auto">
                  {(regions[formState.country as keyof typeof regions] || []).map(region => <CommandItem key={region} value={region} onSelect={(currentValue: string) => { setFormState(prev => ({ ...prev, region: currentValue })); }}>{region}<Check className={`ml-auto h-4 w-4 ${formState.region === region ? "opacity-100" : "opacity-0"}`} /></CommandItem>)}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Address */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Address *</label>
        <input type="text" name="address" required value={formState.address} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2 text-white focus:border-purple-500 focus:ring-purple-500" />
      </div>

      {/* Contact & Hours */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Phone</label>
          <input type="tel" name="phone" value={formState.phone} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2 text-white focus:border-purple-500 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
          <input type="email" name="email" value={formState.email} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2 text-white focus:border-purple-500 focus:ring-purple-500" />
        </div>
      </div>
      
      <OpeningHoursInput value={formState.openingHours} onChange={(newHours) => setFormState(prev => ({ ...prev, openingHours: newHours }))} />

      {/* Price & Delivery */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Price Range</label>
          <select name="priceRange" value={formState.priceRange} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2 text-white focus:border-purple-500 focus:ring-purple-500">
            <option value="$">$ - Budget</option>
            <option value="$$">$$ - Moderate</option>
            <option value="$$$">$$$ - Expensive</option>
            <option value="$$$$">$$$$ - Very Expensive</option>
          </select>
        </div>
        <div className="flex items-end">
          <div className="flex items-center space-x-3">
            <input type="checkbox" id="hasDelivery-edit" name="hasDelivery" checked={formState.hasDelivery} onChange={handleCheckboxChange} className="w-5 h-5 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500" />
            <label htmlFor="hasDelivery-edit" className="text-gray-300">Offers delivery service</label>
          </div>
        </div>
      </div>

      {formState.hasDelivery && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Delivery Fee (π)</label>
            <input type="number" name="deliveryFee" step="0.0000001" value={formState.deliveryFee} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2 text-white focus:border-purple-500 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Est. Delivery Time</label>
            <input type="text" name="deliveryTime" placeholder="e.g., 30-45 min" value={formState.deliveryTime} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2 text-white focus:border-purple-500 focus:ring-purple-500" />
          </div>
        </div>
      )}

      {/* Offers */}
      <div>
        <div className="flex items-center space-x-3 mb-3">
          <input type="checkbox" id="hasOffer-edit" name="hasOffer" checked={formState.hasOffer} onChange={handleCheckboxChange} className="w-5 h-5 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500" /> 
          <label htmlFor="hasOffer-edit" className="text-gray-300">This store has a special offer</label> 
        </div>
        {formState.hasOffer && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Offer Text *</label>
            <input type="text" name="offerText" required={formState.hasOffer} placeholder="e.g., 20% off on all pizzas" value={formState.offerText} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2 text-white focus:border-purple-500 focus:ring-purple-500" />
          </div>
        )}
      </div>


      {/* Submit Button */}
      <div className="flex justify-end pt-4">
        <button type="submit" disabled={isSubmitting} className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}