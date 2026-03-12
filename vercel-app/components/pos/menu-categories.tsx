'use client'

import { useEffect, useState } from 'react'
import { getPosMenus, getPosMenuCategories, type PosMenu } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

export interface MenuItemForSelect {
  id: string
  name: string
  price: number
}

interface MenuCategoriesProps {
  onItemSelect?: (item: MenuItemForSelect) => void
  storeCode?: string
}

export function MenuCategories({ onItemSelect }: MenuCategoriesProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [categories, setCategories] = useState<string[]>([])
  const [mainCategories, setMainCategories] = useState<string[]>([])
  const [menus, setMenus] = useState<PosMenu[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getPosMenus(), getPosMenuCategories()])
      .then(([menusList, catRes]) => {
        setMenus(Array.isArray(menusList) ? menusList : [])
        setCategories(catRes.categories ?? [])
        setMainCategories(catRes.mainCategories ?? [])
        if (catRes.mainCategories?.length) setSelectedCategory(catRes.mainCategories[0])
        else if (catRes.categories?.length) setSelectedCategory(catRes.categories[0])
      })
      .catch(() => setMenus([]))
      .finally(() => setLoading(false))
  }, [])

  const filteredMenus = selectedCategory
    ? menus.filter(m => (m.categoryMain ?? m.category) === selectedCategory || m.category === selectedCategory)
    : menus

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-4">
        {t('posMenuLoading')}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-4">
      {(mainCategories.length > 0 || categories.length > 0) && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {mainCategories.length > 0
            ? mainCategories.map(cat => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </Button>
              ))
            : categories.map(cat => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
        </div>
      )}
      <ScrollArea className="flex-1 min-h-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pr-2">
          {filteredMenus.map(menu => (
            <Button
              key={menu.id}
              variant="outline"
              className="h-auto py-3 px-3 flex flex-col items-center justify-center gap-0.5 text-left font-normal"
              onClick={() => onItemSelect?.({ id: menu.id, name: menu.name, price: menu.price })}
            >
              <span className="text-sm font-medium truncate w-full">{menu.name}</span>
              <span className="text-xs text-muted-foreground">{menu.price.toLocaleString()} ฿</span>
            </Button>
          ))}
        </div>
        {filteredMenus.length === 0 && (
          <div className="flex items-center justify-center text-muted-foreground text-sm py-8">
            {t('posMenuEmpty')}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
