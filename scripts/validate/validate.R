# Cross-check the JS network implementation against R's canonical packages.
#
# Prereqs: install.packages(c("qgraph","psych","lavaan"))
# Run:     node scripts/validate/export_matrices.mjs   # writes out/*.csv
#          Rscript scripts/validate/validate.R

suppressMessages({ library(qgraph); library(lavaan) })

here <- dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)))
if (length(here) == 0 || here == "") here <- "scripts/validate"
OUT <- file.path(here, "out")

d  <- as.matrix(read.csv(file.path(OUT, "data.csv"), check.names = FALSE))
n  <- nrow(d)
rd  <- function(f) as.matrix(read.csv(file.path(OUT, f), check.names = FALSE))
mad <- function(A, B) max(abs(A - B))

S  <- cor(d)                                    # Pearson
Sp <- cor_auto(as.data.frame(d), verbose = FALSE)  # polychoric (lavaan)

cat(sprintf("1. Pearson correlation           max|diff| = %.2e\n", mad(S,  rd("js_pearson.csv"))))
cat(sprintf("2. Polychoric (cor_auto / lavaan) max|diff| = %.2e\n", mad(Sp, rd("js_polychoric.csv"))))

eg <- suppressWarnings(EBICglasso(S, n = n, gamma = 0.5, returnAllResults = TRUE))
cat(sprintf("3. EBICglasso [Pearson]          max|diff| = %.2e  (lambda=%.5f, edges R=%d JS=%d)\n",
    mad(eg$optnet, rd("js_ebicglasso_pearson.csv")), eg$lambda[which.min(eg$ebic)],
    sum(eg$optnet[upper.tri(S)] != 0), sum(rd("js_ebicglasso_pearson.csv")[upper.tri(S)] != 0)))

egp <- suppressWarnings(EBICglasso(Sp, n = n, gamma = 0.5, returnAllResults = TRUE))
cat(sprintf("4. EBICglasso [Polychoric]       max|diff| = %.2e  (lambda=%.5f, edges R=%d JS=%d)\n",
    mad(egp$optnet, rd("js_ebicglasso_poly.csv")), egp$lambda[which.min(egp$ebic)],
    sum(egp$optnet[upper.tri(Sp)] != 0), sum(rd("js_ebicglasso_poly.csv")[upper.tri(Sp)] != 0)))
