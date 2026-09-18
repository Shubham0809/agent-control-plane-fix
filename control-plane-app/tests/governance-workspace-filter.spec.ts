/**
 * Test: Governance page workspace filter
 *
 * Run: npx playwright test tests/governance-workspace-filter.spec.ts --headed
 *
 * Prerequisites:
 * - You must be logged into Databricks (or the app will redirect to login)
 * - Run with --headed to complete OAuth if needed on first run
 *
 * The workspace filter is a searchable combobox (see components/WorkspaceSelect.tsx):
 * - data-testid="workspace-select"  → trigger button (carries data-value = current selection)
 * - data-testid="workspace-search"  → search input inside the open panel
 * - data-testid="workspace-option"  → each option button (carries data-value)
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.APP_URL || 'http://localhost:8000'

/** Open the combobox and return the data-value of the first non-"all" workspace. */
async function firstSpecificWorkspace(page: Page): Promise<string | null> {
  await page.getByTestId('workspace-select').click()
  const options = await page.getByTestId('workspace-option').all()
  for (const o of options) {
    const v = await o.getAttribute('data-value')
    if (v && v !== '__all__') return v
  }
  return null
}

test.describe('Governance page workspace filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60000 })
  })

  test('workspace filter: All Workspaces -> specific workspace', async ({ page }) => {
    await page.waitForSelector('text=Governance', { timeout: 15000 })
    await page.waitForSelector('text=Cost attribution', { timeout: 15000 })

    const trigger = page.getByTestId('workspace-select')
    await expect(trigger).toBeVisible({ timeout: 10000 })
    await expect(trigger).toHaveAttribute('data-value', '__all__')

    await page.screenshot({ path: 'test-results/01-all-workspaces.png', fullPage: true })

    const wsValue = await firstSpecificWorkspace(page)
    if (!wsValue) {
      test.skip(true, 'No specific workspaces available in dropdown')
      return
    }

    // Select via the option list.
    await page.locator(`[data-testid="workspace-option"][data-value="${wsValue}"]`).click()

    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'test-results/02-specific-workspace.png', fullPage: true })

    // Trigger should now reflect the selected workspace.
    await expect(trigger).toHaveAttribute('data-value', wsValue)
  })

  test('search box narrows the workspace list', async ({ page }) => {
    await page.waitForSelector('text=Governance', { timeout: 15000 })

    const wsValue = await firstSpecificWorkspace(page)
    if (!wsValue) {
      test.skip(true, 'No specific workspaces available')
      return
    }

    // Type the workspace id and press Enter — should select the first match.
    const search = page.getByTestId('workspace-search')
    await expect(search).toBeVisible()
    await search.fill(wsValue)
    // Every visible option should match the query.
    const visible = await page.getByTestId('workspace-option').all()
    for (const o of visible) {
      const v = await o.getAttribute('data-value')
      expect(v?.includes(wsValue)).toBeTruthy()
    }
    await search.press('Enter')
    await expect(page.getByTestId('workspace-select')).toHaveAttribute('data-value', wsValue)
  })

  test('Network: page-data includes workspace_id when filter applied', async ({ page }) => {
    await page.waitForSelector('text=Governance', { timeout: 15000 })

    const wsValue = await firstSpecificWorkspace(page)
    if (!wsValue) {
      test.skip(true, 'No workspaces')
      return
    }

    const requests: Array<{ url: string; params: Record<string, string>; status?: number }> = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('page-data')) {
        const u = new URL(url)
        const params: Record<string, string> = {}
        u.searchParams.forEach((v, k) => (params[k] = v))
        requests.push({ url, params })
      }
    })
    page.on('response', (res) => {
      const url = res.url()
      if (url.includes('page-data')) {
        const r = requests.find((x) => x.url === url)
        if (r) r.status = res.status()
      }
    })

    await page.locator(`[data-testid="workspace-option"][data-value="${wsValue}"]`).click()
    await page.waitForTimeout(3000)

    const pageDataCalls = requests.filter((r) => r.url.includes('page-data'))
    const withWorkspaceId = pageDataCalls.filter((r) => r.params?.workspace_id === wsValue)
    const status = pageDataCalls[pageDataCalls.length - 1]?.status

    console.log('\n=== NETWORK: /api/billing/page-data ===')
    console.log('Calls after workspace change:', pageDataCalls.length)
    console.log('Calls with workspace_id param:', withWorkspaceId.length)
    console.log('Response status:', status)

    expect(pageDataCalls.length).toBeGreaterThanOrEqual(1)
    expect(withWorkspaceId.length).toBeGreaterThanOrEqual(1)
    expect(status).toBe(200)
  })
})
