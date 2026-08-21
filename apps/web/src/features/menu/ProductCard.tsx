import CoffeeRoundedIcon from "@mui/icons-material/CoffeeRounded";
import { Box, Card, CardContent, CardMedia, Chip, Divider, Stack, Typography } from "@mui/material";
import { useState } from "react";

import { formatRupees } from "../../lib/currency.js";
import type { Product } from "../../types/catalog.js";

interface ProductCardProps {
  product: Product;
  categoryName: string | undefined;
}

export const ProductCard = ({ product, categoryName }: ProductCardProps) => {
  const [imageFailed, setImageFailed] = useState(false);
  const minimumPrice = Math.min(...product.variants.map((variant) => variant.price));

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
        transition: "transform 180ms ease, box-shadow 180ms ease",
        "@media (hover: hover)": {
          "&:hover": {
            transform: "translateY(-4px)",
            boxShadow: "0 18px 45px rgba(74, 37, 20, 0.12)",
          },
        },
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
        },
      }}
    >
      {product.imageUrl && !imageFailed ? (
        <CardMedia
          component="img"
          height="210"
          image={product.imageUrl}
          alt={product.name}
          onError={() => setImageFailed(true)}
          sx={{ objectFit: "cover" }}
        />
      ) : (
        <Box
          role="img"
          aria-label={`${product.name} image placeholder`}
          sx={{
            height: 210,
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

      <CardContent sx={{ p: 2.5, display: "flex", flexDirection: "column", flex: 1 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
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
                sx={{ alignItems: "center", justifyContent: "space-between" }}
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
                <Typography variant="body2" sx={{ fontWeight: 850 }}>
                  {formatRupees(variant.price)}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
};
