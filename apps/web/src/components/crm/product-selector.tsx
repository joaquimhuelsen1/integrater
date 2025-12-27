"use client"

import { useState, useEffect, useRef } from "react"
import { Search, Package, Plus, Check, Loader2, X } from "lucide-react"

interface Product {
  id: string
  name: string
  description: string | null
  value: number
  sku: string | null
  category: string | null
}

interface ProductSelectorProps {
  onSelect: (product: Product) => void
  onCancel: () => void
  onCreateManual: () => void
}

export function ProductSelector({
  onSelect,
  onCancel,
  onCreateManual,
}: ProductSelectorProps) {
  const [search, setSearch] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  // Load products and categories
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (search.trim()) {
          params.set("search", search.trim())
        }
        if (selectedCategory) {
          params.set("category", selectedCategory)
        }

        const [productsRes, categoriesRes] = await Promise.all([
          fetch(`${API_URL}/products?${params}`),
          fetch(`${API_URL}/products/categories`),
        ])

        if (productsRes.ok) {
          setProducts(await productsRes.json())
          setHighlightedIndex(0)
        }

        if (categoriesRes.ok) {
          const data = await categoriesRes.json()
          setCategories(data.categories || [])
        }
      } catch (error) {
        console.error("Erro ao carregar produtos:", error)
      } finally {
        setIsLoading(false)
      }
    }

    const debounce = setTimeout(loadData, 300)
    return () => clearTimeout(debounce)
  }, [API_URL, search, selectedCategory])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlightedIndex((prev) => Math.min(prev + 1, products.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlightedIndex((prev) => Math.max(prev - 1, 0))
        break
      case "Enter":
        e.preventDefault()
        if (products[highlightedIndex]) {
          onSelect(products[highlightedIndex])
        }
        break
      case "Escape":
        onCancel()
        break
    }
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val)
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
      {/* Header */}
      <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-sm font-medium">
            <Package className="h-4 w-4 text-zinc-500" />
            Selecionar Produto
          </h4>
          <button
            onClick={onCancel}
            className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="border-b border-zinc-200 p-2 dark:border-zinc-700">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar produto..."
            className="w-full rounded border border-zinc-300 py-1.5 pl-8 pr-3 text-sm dark:border-zinc-600 dark:bg-zinc-700"
          />
        </div>

        {/* Categories */}
        {categories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`rounded-full px-2 py-0.5 text-xs ${
                !selectedCategory
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-400"
              }`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  selectedCategory === cat
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-400"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products List */}
      <div className="max-h-48 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : products.length === 0 ? (
          <div className="py-6 text-center text-sm text-zinc-400">
            {search ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
          </div>
        ) : (
          <div className="py-1">
            {products.map((product, index) => (
              <button
                key={product.id}
                onClick={() => onSelect(product)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left ${
                  index === highlightedIndex
                    ? "bg-blue-50 dark:bg-blue-950/30"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {product.name}
                    </span>
                    {product.sku && (
                      <span className="text-xs text-zinc-400">
                        {product.sku}
                      </span>
                    )}
                  </div>
                  {product.description && (
                    <p className="truncate text-xs text-zinc-500">
                      {product.description}
                    </p>
                  )}
                </div>
                <span className="ml-2 text-sm font-semibold text-green-600 dark:text-green-400">
                  {formatCurrency(product.value)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-200 p-2 dark:border-zinc-700">
        <button
          onClick={onCreateManual}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 py-2 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-600 dark:border-zinc-600 dark:hover:border-zinc-500"
        >
          <Plus className="h-4 w-4" />
          Criar produto manual
        </button>
      </div>
    </div>
  )
}
