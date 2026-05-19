<script setup lang="ts">
import { Sparkles } from '@lucide/vue'

import AvatarGenerator from '@/components/persona/AvatarGenerator.vue'
import BioVariantsCard from '@/components/persona/BioVariantsCard.vue'
import BrandIdentityCard from '@/components/persona/BrandIdentityCard.vue'
import TagCloudCard from '@/components/persona/TagCloudCard.vue'
import type { PersonaBrand } from '@/types/persona'

defineProps<{
  brand: PersonaBrand | undefined
  loading: boolean
}>()
</script>

<template>
  <section v-if="brand" class="grid gap-4">
    <AvatarGenerator :brand="brand" :loading="loading" />
    <BrandIdentityCard :brand="brand" :loading="loading" />
    <BioVariantsCard :brand="brand" :loading="loading" />
    <TagCloudCard :tags="brand.tags" />
  </section>

  <section v-else class="grid min-h-[620px] place-items-center rounded-lg border border-dashed border-border bg-card/70 p-8 text-center shadow-soft">
    <div class="max-w-sm">
      <span class="mx-auto grid size-14 place-items-center rounded-lg bg-primary/10 text-primary">
        <Sparkles class="size-7" />
      </span>
      <h2 class="mt-5 text-2xl font-semibold tracking-normal text-foreground">尚未创建身份资产</h2>
      <p class="mt-3 text-sm leading-6 text-muted-foreground">
        生成后将展示头像、名称、签名、简介与关键词。
      </p>
    </div>
  </section>
</template>
