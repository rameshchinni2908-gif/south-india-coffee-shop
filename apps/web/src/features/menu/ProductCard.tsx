import AddShoppingCartRoundedIcon from "@mui/icons-material/AddShoppingCartRounded";
import CoffeeRoundedIcon from "@mui/icons-material/CoffeeRounded";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";

import { formatRupees } from "../../lib/currency.js";
import type { Product } from "../../types/catalog.js";
import { useCart } from "../cart/use-cart.js";
import { getCategoryArtwork } from "./category-artwork.js";

interface ProductCardProps {
  product: Product;
  categoryName: string | undefined;
  categorySlug: string | undefined;
  animationOrder?: number;
}

export const ProductCard = ({
  product,
  categoryName,
  categorySlug,
  animationOrder = 0,
}: ProductCardProps) => {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const { addItem } = useCart();
  const minimumPrice = Math.min(...product.variants.map((variant) => variant.price));
  const categoryArtwork = getCategoryArtwork(categorySlug, categoryName);
  const imageSource = [product.imageUrl, categoryArtwork].find(
    (source): source is string =>
      typeof source === "string" && source.length > 0 && !failedImages.includes(source),
  );
  const isProductImage = imageSource === product.imageUrl;

  return (
    <Card
      component="article"
      variant="outlined"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderColor: "rgba(91, 50, 29, 0.14)",
        boxShadow: "0 10px 30px rgba(74, 37, 20, 0.045)",
        animation: "card-enter 420ms cubic-bezier(.2,.75,.25,1) both",
        animationDelay: `${Math.min(animationOrder, 8) * 55}ms`,
        transition: "transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease",
        "&:focus-within": {
          borderColor: "primary.light",
          boxShadow: "0 16px 40px rgba(74, 37, 20, 0.11)",
        },
        "@media (hover: hover)": {
          "&:hover": {
            transform: "translateY(-4px)",
            boxShadow: "0 18px 45px rgba(74, 37, 20, 0.12)",
            borderColor: "rgba(111, 50, 25, 0.26)",
          },
          "&:hover .menu-card-image": {
            transform: "scale(1.025)",
          },
        },
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
          animation: "none",
          "& .menu-card-image": { transition: "none" },
        },
      }}
    >
      {imageSource ? (
        <CardMedia
          className="menu-card-image"
          component="img"
          image={imageSource}
          alt={isProductImage ? product.name : `${categoryName ?? "Menu"} category presentation`}
          loading="lazy"
          onError={() =>
            setFailedImages((current) =>
              current.includes(imageSource) ? current : [...current, imageSource],
            )
          }
          sx={{
            height: { xs: 190, sm: 210 },
            objectFit: "cover",
            transform: "scale(1)",
            transition: "transform 420ms cubic-bezier(.2,.75,.25,1)",
          }}
        />
      ) : (
        <Box
          role="img"
          aria-label={`${product.name} image placeholder`}
          sx={{
            height: { xs: 190, sm: 210 },
            display: "grid",
            placeItems: "center",
            color: "primary.main",
            background:
              "radial-gradient(circle at 35% 35%, rgba(217,132,61,.22), transparent 26%), linear-gradient(145deg, #f8ead6, #efe0c9)",
          }}
        >
          <CoffeeRoundedIcon sx={{ fontSize: 66, opacity: 0.7 }} />
        </Box>
      )}

      <CardContent
        sx={{ p: { xs: 2, sm: 2.5 }, display: "flex", flexDirection: "column", flex: 1 }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            rowGap: 1,
          }}
        >
          <Box>
            {categoryName && (
              <Typography
                variant="caption"
                color="secondary.dark"
                sx={{ fontWeight: 850, letterSpacing: "0.08em" }}
              >
                {categoryName.toUpperCase()}
              </Typography>
            )}
            <Typography component="h3" variant="h5" sx={{ mt: 0.4, fontWeight: 850 }}>
              {product.name}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={product.isVegetarian ? "Veg" : "Non-veg"}
            color={product.isVegetarian ? "success" : "error"}
            variant="outlined"
          />
        </Stack>

        <Typography
          color="text.secondary"
          sx={{
            mt: 1.25,
            lineHeight: 1.55,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {product.description}
        </Typography>

        <Typography sx={{ mt: 2, color: "primary.main", fontWeight: 850 }}>
          From {formatRupees(minimumPrice)}
        </Typography>
        <Divider sx={{ my: 2 }} />

        <Stack spacing={1.25} sx={{ mt: "auto" }}>
          {product.variants.map((variant) => {
            const isSellable = variant.isAvailable && variant.stockQuantity > 0;

            return (
              <Stack
                key={variant.id}
                direction="row"
                spacing={2}
                useFlexGap
                sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 750 }}>
                    {variant.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: isSellable ? "success.main" : "text.disabled" }}
                  >
                    {isSellable ? "Available" : "Unavailable"}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography variant="body2" sx={{ fontWeight: 850 }}>
                    {formatRupees(variant.price)}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!isSellable}
                    startIcon={<AddShoppingCartRoundedIcon />}
                    sx={{ minWidth: 82 }}
                    onClick={() =>
                      addItem({
                        productId: product.id,
                        productName: product.name,
                        variantId: variant.id,
                        variantName: variant.name,
                        sku: variant.sku,
                        unitPrice: variant.price,
                        stockQuantity: variant.stockQuantity,
                      })
                    }
                    aria-label={`Add ${product.name} ${variant.name} to cart`}
                  >
                    Add
                  </Button>
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
};
