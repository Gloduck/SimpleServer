<template>
  <div class="code-editor-view app-shell" :class="[`theme-${settings.theme}`, { 'side-panel-hidden': !sidePanelVisible, resizing: sidebarResizing || previewResizing, 'preview-resizing': previewResizing }]" :style="{ '--side-panel-width': `${sidebarWidth}px`, '--preview-pane-width': `${previewWidth}px` }">
    <aside class="activity-bar" :aria-label="tr('nav.main')">
      <button class="activity-button" :class="{ active: activeView === 'explorer' }" :title="tr('activity.explorer')" :aria-label="tr('activity.explorer')" @click="showPanel('explorer')">
        <span class="codicon codicon-files" aria-hidden="true"></span>
      </button>
      <button class="activity-button" :class="{ active: activeView === 'search' }" :title="tr('activity.search')" :aria-label="tr('activity.search')" @click="showPanel('search')">
        <span class="codicon codicon-search" aria-hidden="true"></span>
      </button>
      <button class="activity-button" :class="{ active: activeView === 'changes' }" :title="tr('activity.changes')" :aria-label="tr('activity.changes')" @click="showPanel('changes')">
        <span class="codicon codicon-source-control" aria-hidden="true"></span>
      </button>
      <button class="activity-button" :class="{ active: activeView === 'ai' }" :title="tr('activity.ai')" :aria-label="tr('activity.ai')" @click="showPanel('ai')">
        <span class="codicon codicon-sparkle" aria-hidden="true"></span>
      </button>
      <button class="activity-button" :class="{ active: activeView === 'ssh' }" :title="tr('activity.ssh')" :aria-label="tr('activity.ssh')" @click="showPanel('ssh')">
        <span class="codicon codicon-terminal" aria-hidden="true"></span>
      </button>
      <button class="activity-button" :class="{ active: activeView === 'settings' }" :title="tr('activity.settings')" :aria-label="tr('activity.settings')" @click="showPanel('settings')">
        <span class="codicon codicon-settings-gear" aria-hidden="true"></span>
      </button>
    </aside>

    <aside class="side-panel">
      <section v-show="activeView === 'explorer'" class="panel-view active">
        <header class="panel-header">
          <div class="panel-title">
            <p class="eyebrow">Explorer</p>
            <h1>{{ tr('panel.files') }}</h1>
            <small class="panel-workspace-name" :title="rootHandle ? rootName : tr('workspace.none')">{{ rootHandle ? rootName : tr('workspace.none') }}</small>
          </div>
          <button class="icon-button" :title="tr('action.refreshTree')" :aria-label="tr('action.refreshTree')" :disabled="!rootHandle" @click="refreshTree">
            <span class="codicon codicon-refresh" aria-hidden="true"></span>
          </button>
        </header>
        <div class="panel-actions">
          <button @click="openFolder">{{ tr('action.openFolder') }}</button>
        </div>
        <nav class="file-tree" :aria-label="tr('panel.files')" @contextmenu.prevent="showContextMenu($event, null)">
          <div v-if="!rootHandle" class="workspace-card">{{ tr('workspace.treeEmpty') }}</div>
          <TreeList v-else :nodes="tree" :depth="0" :active-path="activePath" :collapsed-paths="collapsedPaths" :dirty-paths="dirtyPathSet" @open-file="openFile" @toggle-dir="toggleDirectory" @context-node="showContextMenu" />
        </nav>
      </section>

      <section v-show="activeView === 'search'" class="panel-view active">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Search</p>
            <h1>{{ tr('panel.search') }}</h1>
          </div>
          <button class="icon-button" :title="tr('search.clear')" :aria-label="tr('search.clear')" :disabled="!searchQuery && searchResults.length === 0" @click="clearSearchResults">
            <span class="codicon codicon-clear-all" aria-hidden="true"></span>
          </button>
        </header>
        <form class="search-form" @submit.prevent="runGlobalSearch">
          <div class="search-row">
            <input v-model="searchQuery" type="search" :placeholder="tr('search.placeholder')" :disabled="!rootHandle || searchBusy" autocomplete="off" spellcheck="false" />
            <button type="button" class="search-option" :class="{ active: searchMatchCase }" :title="tr('search.matchCase')" :aria-label="tr('search.matchCase')" @click="searchMatchCase = !searchMatchCase">Aa</button>
            <button type="submit" :disabled="!rootHandle || searchBusy || !searchQuery.trim()">{{ searchBusy ? tr('search.running') : tr('search.submit') }}</button>
          </div>
          <div class="search-row replace-row">
            <input v-model="searchReplaceText" type="text" :placeholder="tr('search.replacePlaceholder')" :disabled="!rootHandle || searchBusy" autocomplete="off" spellcheck="false" />
            <button type="button" :disabled="!rootHandle || searchBusy || searchResults.length === 0" @click="replaceAllSearchResults">{{ tr('search.replaceAll') }}</button>
          </div>
        </form>
        <div class="search-results">
          <div v-if="!rootHandle" class="workspace-card">{{ tr('workspace.treeEmpty') }}</div>
          <div v-else-if="searchBusy" class="workspace-card">{{ tr('search.running') }}</div>
          <div v-else-if="searchSearched && searchResults.length === 0" class="workspace-card">{{ tr('search.noResults') }}</div>
          <div v-else-if="!searchSearched" class="workspace-card">{{ tr('search.empty') }}</div>
          <section v-for="result in searchResults" v-else :key="result.path" class="search-result-file">
            <button type="button" class="search-result-file-header" :title="result.path" @click="openFileByPath(result.path)">
              <span class="codicon" :class="getTreeIconClass({ name: result.name, kind: 'file' })" aria-hidden="true"></span>
              <span>{{ result.path }}</span>
              <small>{{ result.matches.length }}</small>
            </button>
            <button v-for="match in result.matches" :key="`${result.path}:${match.lineNumber}:${match.column}`" type="button" class="search-result-match" :title="match.lineText" @click="openSearchResult(result, match)">
              <small>{{ match.lineNumber }}</small>
              <span class="search-result-line">
                <template v-for="(segment, segmentIndex) in getSearchMatchSegments(match)" :key="segmentIndex">
                  <mark v-if="segment.match">{{ segment.text }}</mark>
                  <span v-else>{{ segment.text }}</span>
                </template>
              </span>
            </button>
          </section>
        </div>
      </section>

      <section v-show="activeView === 'changes'" class="panel-view active">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Changes</p>
            <h1>{{ tr('panel.changes') }}</h1>
          </div>
          <span class="change-count">{{ dirtyFiles.length }}</span>
        </header>
        <div class="changes-toolbar">
          <label class="change-select-all">
            <input type="checkbox" :checked="allChangesSelected" :disabled="dirtyFiles.length === 0" @change="toggleAllChangesSelection($event.target.checked)" />
            <span>{{ tr('changes.selectAll') }}</span>
          </label>
          <span>{{ tr('changes.selectedCount', { count: selectedChangeFiles.length }) }}</span>
          <button type="button" :disabled="selectedChangeFiles.length === 0" @click="saveSelectedChanges">{{ tr('changes.saveSelected') }}</button>
          <button type="button" :disabled="selectedChangeFiles.length === 0" @click="revertSelectedChanges">{{ tr('changes.revertSelected') }}</button>
        </div>
        <div class="changes-list">
          <div v-if="dirtyFiles.length === 0" class="workspace-card">{{ tr('changes.none') }}</div>
          <div v-for="file in dirtyFiles" :key="file.path" class="change-row" :class="{ active: file.path === activeDiffPath }" :title="tr('changes.openDiff')" role="button" tabindex="0" @click="activateDiff(file.path)" @keydown.enter.prevent="activateDiff(file.path)" @keydown.space.prevent="activateDiff(file.path)" @contextmenu.prevent="showChangesContextMenu($event, file)">
            <input type="checkbox" :checked="selectedChangePaths.has(file.path)" :aria-label="tr('changes.selectChange')" @click.stop @change="toggleChangeSelection(file.path, $event.target.checked)" />
            <span class="codicon" :class="file.deleted ? 'codicon-trash' : 'codicon-diff-modified'" aria-hidden="true"></span>
            <span class="change-main">
              <strong>{{ file.name }}</strong>
              <small>{{ file.deleted ? `${tr('changes.deleted')} · ${file.path}` : file.path }}</small>
            </span>
          </div>
        </div>
      </section>

      <section v-show="activeView === 'ai'" class="panel-view active">
        <header class="panel-header ai-panel-header">
          <div>
            <p class="eyebrow">Assistant</p>
            <h1>{{ tr('panel.ai') }}</h1>
            <span class="ai-context-length">{{ tr('ai.contextLength', { count: aiContextLength }) }}</span>
          </div>
          <div class="ai-header-actions">
            <button type="button" class="small-button" :disabled="aiBusy || aiMessages.length === 0" @click="compressAiContext">{{ tr('ai.compressContext') }}</button>
            <button type="button" class="small-button" :disabled="aiBusy || !canResetAiConversation" @click="resetAiConversation">{{ tr('ai.resetConversation') }}</button>
            <button class="icon-button" :title="tr('ai.stop')" :aria-label="tr('ai.stop')" :disabled="!aiBusy" @click="stopAiTask">
              <span class="codicon codicon-debug-stop" aria-hidden="true"></span>
            </button>
          </div>
        </header>
        <div class="ai-session-bar">
          <label class="ai-session-select">
            <span>{{ tr('ai.session') }}</span>
            <select v-model="activeAiSessionId">
              <option v-for="session in aiSessions" :key="session.id" :value="session.id">{{ session.title }} · {{ session.messages.length }}</option>
            </select>
          </label>
          <button type="button" class="small-button" @click="createAiSessionAndActivate">{{ tr('ai.newSession') }}</button>
          <button type="button" class="small-button" :disabled="aiBusy || aiSessions.length <= 1" @click="deleteActiveAiSession">{{ tr('ai.deleteSession') }}</button>
        </div>
        <div class="ai-chat">
          <div ref="aiMessagesEl" class="ai-chat-messages">
            <div v-if="aiMessages.length === 0" class="workspace-card">{{ tr('ai.empty') }}</div>
            <article v-for="message in aiMessages" :key="message.id" class="ai-message" :class="`ai-message-${message.role}`">
              <template v-if="message.role === 'tool' && message.tool">
                <button type="button" class="ai-tool-toggle" @click="message.expanded = !message.expanded">
                  <span>{{ tr('ai.role.tool') }} · {{ message.tool.name }} · {{ message.tool.ok ? 'OK' : 'ERROR' }}</span>
                  <span class="codicon" :class="message.expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'" aria-hidden="true"></span>
                </button>
                <div class="ai-message-content" v-html="renderMarkdown(message.content)"></div>
                <div v-if="message.expanded" class="ai-tool-details">
                  <div>
                    <strong>{{ tr('ai.toolArgs') }}</strong>
                    <pre>{{ formatJsonForDisplay(message.tool.args) }}</pre>
                  </div>
                  <div>
                    <strong>{{ tr('ai.toolResult') }}</strong>
                    <pre>{{ formatJsonForDisplay(message.tool.result) }}</pre>
                  </div>
                </div>
              </template>
              <template v-else>
                <strong>{{ tr(`ai.role.${message.role}`) }}</strong>
                <div class="ai-message-content" v-html="renderMarkdown(message.content)"></div>
              </template>
            </article>
          </div>
          <form class="ai-chat-form" @submit.prevent="sendAiPrompt">
            <textarea v-model="aiPrompt" :placeholder="tr('ai.placeholder')" :disabled="aiBusy" rows="4" @keydown="handleAiPromptKeydown"></textarea>
            <button type="submit" :disabled="aiBusy || !aiPrompt.trim()">{{ aiBusy ? tr('ai.running') : tr('ai.send') }}</button>
            <div class="ai-chat-options">
              <label>
                <span>{{ tr('ai.agentModel') }}</span>
                <select v-model="settings.ai.agentModel" :disabled="aiBusy">
                  <option v-for="model in aiAgentModelOptions" :key="`chat-agent-${model}`" :value="model">{{ model }}</option>
                </select>
              </label>
              <label>
                <span>{{ tr('ai.reasoningEffort') }}</span>
                <select v-model="settings.ai.reasoningEffort" :disabled="aiBusy">
                  <option v-for="effort in aiReasoningEfforts" :key="effort" :value="effort">{{ tr(`ai.reasoning.${effort}`) }}</option>
                </select>
              </label>
            </div>
          </form>
        </div>
      </section>

      <section v-show="activeView === 'ssh'" class="panel-view active">
        <header class="panel-header">
          <div>
            <p class="eyebrow">SSH</p>
            <h1>{{ tr('panel.ssh') }}</h1>
          </div>
          <button class="icon-button" :title="tr('ssh.add')" :aria-label="tr('ssh.add')" :disabled="!sshFeatureEnabled" @click="openCreateSshDialog">
            <span class="codicon codicon-add" aria-hidden="true"></span>
          </button>
        </header>
        <div v-if="!sshFeatureEnabled" class="workspace-card ssh-disabled-card">
          <strong>{{ tr('ssh.disabledTitle') }}</strong>
          <small>{{ tr('ssh.disabledDescription') }}</small>
        </div>
        <div class="ssh-list">
          <div v-if="settings.ssh.connections.length === 0" class="workspace-card">{{ tr('ssh.empty') }}</div>
          <article v-for="connection in settings.ssh.connections" :key="connection.id" class="ssh-card" :class="{ active: isSshConnected(connection.id) }">
            <div class="ssh-card-main">
              <span class="codicon" :class="isSshConnected(connection.id) ? 'codicon-debug-console' : 'codicon-terminal'" aria-hidden="true"></span>
              <div>
                <strong>{{ connection.name || connection.host }}</strong>
                <small>{{ connection.username }}@{{ connection.host }}:{{ connection.port || 22 }}</small>
              </div>
            </div>
            <div class="ssh-card-meta">
              <span>{{ tr(isSshConnected(connection.id) ? 'ssh.connected' : 'ssh.disconnected') }}</span>
              <span>{{ tr(connection.exposeToAi ? 'ssh.aiExposed' : 'ssh.aiHidden') }}</span>
            </div>
            <div class="ssh-card-actions">
              <button type="button" :disabled="!sshFeatureEnabled || isSshConnected(connection.id)" @click="connectSshConfig(connection)">{{ tr('ssh.connect') }}</button>
              <button type="button" :disabled="!isSshConnected(connection.id)" @click="disconnectSshConfig(connection.id)">{{ tr('ssh.disconnect') }}</button>
              <button type="button" :disabled="!sshFeatureEnabled" @click="openEditSshDialog(connection)">{{ tr('ssh.edit') }}</button>
              <button type="button" class="danger" :disabled="isSshConnected(connection.id)" @click="deleteSshConfig(connection.id)">{{ tr('ssh.delete') }}</button>
            </div>
          </article>
        </div>
      </section>

      <section v-show="activeView === 'settings'" class="panel-view active">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Preferences</p>
            <h1>{{ tr('panel.settings') }}</h1>
          </div>
        </header>
        <div class="settings-list">
          <label class="setting-row">
            <span>{{ tr('settings.theme') }}</span>
            <select v-model="settings.theme" @change="applyTheme">
              <option value="vs-dark">Dark Modern</option>
              <option value="vs">Light Modern</option>
              <option value="hc-black">High Contrast</option>
            </select>
          </label>
          <label class="setting-row">
            <span>{{ tr('settings.locale') }}</span>
            <select v-model="settings.locale" @change="applyLocale">
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <section class="setting-row keybinding-card">
            <div class="setting-title-row">
              <span>{{ tr('settings.ai') }}</span>
            </div>
            <label class="setting-row">
              <span>{{ tr('settings.aiApiKey') }}</span>
              <input v-model="settings.ai.apiKey" type="password" autocomplete="off" spellcheck="false" :placeholder="tr('settings.aiApiKeyPlaceholder')" />
            </label>
            <label class="setting-row">
              <span>{{ tr('settings.aiBaseUrl') }}</span>
              <input v-model="settings.ai.baseUrl" spellcheck="false" />
            </label>
            <button type="button" class="setting-action-button" :disabled="aiModelsLoading || !settings.ai.apiKey.trim()" @click="fetchAiModels">
              {{ aiModelsLoading ? tr('settings.aiModelsLoading') : tr('settings.aiFetchModels') }}
            </button>
            <label class="setting-row">
              <span>{{ tr('settings.aiCompletionModel') }}</span>
              <input v-model="settings.ai.completionModel" list="ai-model-options" spellcheck="false" />
            </label>
            <label class="setting-row">
              <span>{{ tr('settings.aiAgentModel') }}</span>
              <input v-model="settings.ai.agentModels" spellcheck="false" :placeholder="tr('settings.aiAgentModelsPlaceholder')" @change="normalizeAgentModelsInput" />
            </label>
            <div class="setting-inline-row">
              <select v-model="agentModelToAdd" :aria-label="tr('settings.aiAgentModelToAdd')">
                <option value="">{{ tr('settings.aiAgentModelToAdd') }}</option>
                <option v-for="model in aiModelOptions" :key="`add-agent-${model}`" :value="model">{{ model }}</option>
              </select>
              <button type="button" :disabled="!agentModelToAdd" @click="addAgentModelFromSelect">{{ tr('settings.aiAddAgentModel') }}</button>
            </div>
            <datalist id="ai-model-options">
              <option v-for="model in aiModelOptions" :key="model" :value="model"></option>
            </datalist>
            <small class="setting-hint">{{ tr('settings.aiHint') }}</small>
          </section>
          <section class="setting-row keybinding-card">
            <div class="setting-title-row">
              <span>{{ tr('settings.backend') }}</span>
            </div>
            <label class="setting-row checkbox-row">
              <input v-model="settings.backend.enabled" type="checkbox" />
              <span>{{ tr('settings.backendEnabled') }}</span>
            </label>
            <label class="setting-row">
              <span>{{ tr('settings.backendBaseUrl') }}</span>
              <input v-model="settings.backend.baseUrl" spellcheck="false" :placeholder="defaultBackendSettings.baseUrl" @change="normalizeBackendBaseUrl" />
            </label>
            <small class="setting-hint">{{ tr('settings.backendHint') }}</small>
            <label class="setting-row">
              <span>{{ tr('settings.sshSecurityKey') }}</span>
              <input v-model="settings.ssh.securityKey" type="password" autocomplete="off" spellcheck="false" :placeholder="tr('settings.sshSecurityKeyPlaceholder')" />
            </label>
            <label class="setting-row">
              <span>{{ tr('settings.sshTerminalTheme') }}</span>
              <select v-model="settings.ssh.terminalTheme" @change="applySshTerminalTheme">
                <option v-for="theme in sshTerminalThemeOptions" :key="theme.value" :value="theme.value">{{ theme.label }}</option>
              </select>
            </label>
            <label class="setting-row">
              <span>{{ tr('settings.sshWhitelistTemplate') }}</span>
              <textarea v-model="settings.ssh.whitelistTemplate" rows="5" spellcheck="false" :placeholder="DEFAULT_SSH_WHITELIST_TEMPLATE"></textarea>
            </label>
            <button type="button" class="setting-action-button" @click="resetSshWhitelistTemplate">{{ tr('settings.resetSshWhitelistTemplate') }}</button>
          </section>
          <section class="setting-row keybinding-card">
            <div class="setting-title-row">
              <span>{{ tr('settings.keybindings') }}</span>
              <button type="button" @click="resetKeybindings">{{ tr('settings.resetKeybindings') }}</button>
            </div>
            <label v-for="item in shortcutItems" :key="item.key" class="shortcut-row">
              <span>{{ tr(item.labelKey) }}</span>
              <input v-model="settings.shortcuts[item.key]" spellcheck="false" @change="updateKeybindings" />
            </label>
            <small class="setting-hint">{{ tr('settings.shortcutHint') }}</small>
          </section>
          <label class="setting-row">
            <span>{{ tr('settings.fontSize') }}</span>
            <input v-model.number="settings.fontSize" type="number" min="10" max="30" step="1" @change="applyEditorOptions" />
          </label>
          <label class="setting-row checkbox-row">
            <input v-model="settings.wordWrap" type="checkbox" @change="applyEditorOptions" />
            <span>{{ tr('settings.wordWrap') }}</span>
          </label>
          <label class="setting-row checkbox-row">
            <input v-model="settings.minimap" type="checkbox" @change="applyEditorOptions" />
            <span>{{ tr('settings.minimap') }}</span>
          </label>
          <section class="setting-row keybinding-card">
            <div class="setting-title-row">
              <span>{{ tr('settings.exportUrl') }}</span>
              <button type="button" @click="exportSettingsUrl">{{ tr('settings.copyExportUrl') }}</button>
            </div>
            <small class="setting-hint">{{ tr('settings.exportUrlHint') }}</small>
          </section>
        </div>
      </section>
      <div class="side-panel-resizer" role="separator" aria-orientation="vertical" :aria-valuenow="sidebarWidth" :aria-valuemin="SIDEBAR_MIN_WIDTH" :aria-valuemax="SIDEBAR_MAX_WIDTH" @pointerdown="startSidebarResize"></div>
    </aside>

    <main class="editor-shell">
      <div class="command-bar">
        <button type="button" class="command-center" :title="tr('commandCenter.title')" :aria-label="tr('commandCenter.title')" @click="openCommandPalette">
          <span class="codicon codicon-search" aria-hidden="true"></span>
          <span class="command-center-label">{{ tr('commandCenter.placeholder') }}</span>
          <span class="command-center-shortcut">{{ settings.shortcuts.commandPalette }}</span>
        </button>
        <button type="button" class="command-icon-button" :title="tr('action.findReferences')" :aria-label="tr('action.findReferences')" :disabled="!activeFile" @click="triggerFindReferences">
          <span class="codicon codicon-references" aria-hidden="true"></span>
        </button>
        <button type="button" class="command-icon-button" :class="{ active: previewVisible }" :title="tr('action.preview')" :aria-label="tr('action.preview')" :disabled="!canPreviewActiveFile" @click="togglePreview">
          <span class="codicon codicon-open-preview" aria-hidden="true"></span>
        </button>
      </div>
      <div class="tabs" role="tablist">
        <button v-for="file in openFileList" :key="file.path" class="tab" :class="{ active: file.path === activePath && !activeDiffPath && !activeSshTerminal }" :title="file.path" role="tab" :aria-selected="file.path === activePath && !activeDiffPath && !activeSshTerminal" @click="activateFile(file.path)">
          <span class="tab-name">{{ file.name }}</span>
          <span class="dirty-dot">{{ file.dirty ? '•' : '' }}</span>
          <span class="tab-close" :title="tr('action.close')" @click.stop="closeFile(file.path)">×</span>
        </button>
        <button v-for="terminal in sshTerminalTabs" :key="`ssh:${terminal.configId}`" class="tab ssh-tab" :class="{ active: terminal.configId === activeSshTerminalId }" :title="terminal.title" role="tab" :aria-selected="terminal.configId === activeSshTerminalId" @click="activateSshTerminal(terminal.configId)">
          <span class="codicon codicon-terminal" aria-hidden="true"></span>
          <span class="tab-name">{{ terminal.title }}</span>
          <span class="dirty-dot">{{ terminal.connected ? '●' : '' }}</span>
          <span class="tab-close" :title="tr('action.close')" @click.stop="closeSshTerminalTab(terminal.configId)">×</span>
        </button>
      </div>

      <section class="editor-stage" :class="{ 'preview-open': previewPaneVisible }">
        <div v-show="!activePath && !activeDiffPath && !activeSshTerminal" class="empty-state">
          <h2>{{ tr('empty.title') }}</h2>
          <p>{{ tr('empty.description') }}</p>
          <button @click="openFolder">{{ tr('action.openFolder') }}</button>
        </div>
        <div ref="editorHost" class="monaco-host" :class="{ visible: activeTextFile && !activeDiffPath && !activeSshTerminal }" :aria-label="tr('editor.aria')"></div>
        <div v-if="activeImageFile && !activeDiffPath && !activeSshTerminal" class="image-preview" :aria-label="tr('imagePreview.aria')" @click="focusActivePreviewEditor">
          <img :src="activeImageFile.objectUrl" :alt="activeImageFile.name" />
          <div class="image-preview-meta">
            <strong>{{ activeImageFile.name }}</strong>
            <span>{{ FileUtils.formatFileSize(activeImageFile.size) }} · {{ activeImageFile.mimeType || tr('imagePreview.type') }}</span>
          </div>
        </div>
        <div v-if="activeUnsupportedFile && !activeDiffPath && !activeSshTerminal" class="unsupported-preview" :aria-label="tr('unsupportedFile.aria')" @click="focusActivePreviewEditor">
          <span class="codicon codicon-warning" aria-hidden="true"></span>
          <h2>{{ tr('unsupportedFile.title') }}</h2>
          <p>{{ tr('unsupportedFile.description') }}</p>
          <small>{{ activeUnsupportedFile.path }} · {{ FileUtils.formatFileSize(activeUnsupportedFile.size) }}{{ activeUnsupportedFile.mimeType ? ` · ${activeUnsupportedFile.mimeType}` : '' }}</small>
        </div>
        <div v-if="activeDiffUnsupportedFile && !activeSshTerminal" class="unsupported-preview diff-placeholder" :aria-label="tr('diff.aria')" @click="focusActivePreviewEditor">
          <span class="codicon codicon-diff-modified" aria-hidden="true"></span>
          <h2>{{ tr('diff.unsupportedTitle') }}</h2>
          <p>{{ tr('diff.unsupportedDescription') }}</p>
          <small>{{ activeDiffUnsupportedFile.path }} · {{ activeDiffUnsupportedFile.deleted ? tr('changes.deleted') : tr('status.unsaved') }}</small>
        </div>
        <div ref="diffHost" class="monaco-host diff-host" :class="{ visible: activeDiffPath && !activeDiffUnsupportedFile && !activeSshTerminal }" :aria-label="tr('diff.aria')"></div>
        <section v-if="activeSshTerminal" class="ssh-terminal" :aria-label="tr('ssh.terminal')">
          <header class="ssh-terminal-header">
            <span>{{ activeSshTerminal.title }}</span>
            <small>{{ tr(activeSshTerminal.connected ? 'ssh.connected' : 'ssh.disconnected') }}</small>
          </header>
          <div v-show="activeSshTerminal.terminal" ref="sshTerminalHost" class="ssh-terminal-host"></div>
          <pre v-if="!activeSshTerminal.terminal" class="ssh-terminal-fallback">{{ activeSshTerminal.output || tr('ssh.noOutput') }}</pre>
        </section>
        <aside v-if="previewPaneVisible && !activeSshTerminal" class="preview-pane" :aria-label="tr('preview.aria')">
          <div class="preview-pane-resizer" role="separator" aria-orientation="vertical" :aria-valuenow="previewWidth" :aria-valuemin="PREVIEW_MIN_WIDTH" :aria-valuemax="PREVIEW_MAX_WIDTH" @pointerdown="startPreviewResize"></div>
          <header class="preview-header">
            <span>{{ tr(previewMode === 'markdown' ? 'preview.markdown' : 'preview.html') }}</span>
            <button type="button" class="icon-button" :title="tr('action.close')" :aria-label="tr('action.close')" @click="closePreview">
              <span class="codicon codicon-close" aria-hidden="true"></span>
            </button>
          </header>
          <div v-if="previewMode === 'markdown'" class="preview-content markdown-preview" v-html="previewContent"></div>
          <iframe v-else :key="previewFrameKey" class="preview-frame" sandbox="allow-forms allow-modals allow-popups allow-scripts" :srcdoc="previewContent"></iframe>
        </aside>
      </section>

      <footer class="status-bar">
        <div class="status-left-group">
          <span id="status-left">{{ status.left }}</span>
          <button id="save-file" :disabled="!activeFile?.dirty || activeSshTerminal" @click="saveActiveFile">{{ tr('status.saveButton', { shortcut: settings.shortcuts.save }) }}</button>
        </div>
        <div class="status-right-group">
          <span id="status-right">{{ status.right }}</span>
          <select v-model="activeLanguage" :disabled="!activeTextFile || activeFile.deleted || activeSshTerminal" :aria-label="tr('status.language')" @change="changeActiveLanguage">
            <option v-for="language in languageOptions" :key="language.id" :value="language.id">{{ language.label }}</option>
          </select>
        </div>
      </footer>
    </main>

    <div v-show="contextMenu.visible" class="context-menu visible" role="menu" :aria-label="tr('menu.fileTree')" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop>
      <button type="button" role="menuitem" @click="runContextAction('new-file')">{{ tr('action.newFile') }}</button>
      <button type="button" role="menuitem" @click="runContextAction('new-folder')">{{ tr('action.newFolder') }}</button>
      <button type="button" role="menuitem" @click="runContextAction('new-file-pending')">{{ tr('action.newFilePending') }}</button>
      <div class="context-separator" aria-hidden="true"></div>
      <button type="button" role="menuitem" class="danger" :disabled="!contextMenu.node" @click="runContextAction('delete')">{{ tr('action.delete') }}</button>
      <button type="button" role="menuitem" class="danger" :disabled="!contextMenu.node || contextMenu.node.kind !== 'file'" @click="runContextAction('delete-pending')">{{ tr('action.deletePending') }}</button>
      <div class="context-separator" aria-hidden="true"></div>
      <button type="button" role="menuitem" @click="runContextAction('refresh')">{{ tr('action.refreshTree') }}</button>
    </div>

    <div v-show="changesContextMenu.visible" class="context-menu visible" role="menu" :aria-label="tr('menu.changes')" :style="{ left: `${changesContextMenu.x}px`, top: `${changesContextMenu.y}px` }" @click.stop>
      <button type="button" role="menuitem" @click="runChangesContextAction('open-diff')">{{ tr('changes.openDiff') }}</button>
      <div class="context-separator" aria-hidden="true"></div>
      <button type="button" role="menuitem" class="danger" @click="runChangesContextAction('revert')">{{ tr('action.revert') }}</button>
    </div>

    <div v-if="dialogState.visible" class="editor-dialog-backdrop" role="presentation" @click.self="cancelDialog">
      <form class="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-dialog-title" @submit.prevent="confirmDialog" @keydown.esc.prevent.stop="cancelDialog" @click.stop>
        <div class="editor-dialog-header">
          <span class="codicon" :class="dialogIconClass" aria-hidden="true"></span>
          <h2 id="editor-dialog-title">{{ dialogState.title }}</h2>
        </div>
        <p class="editor-dialog-message">{{ dialogState.message }}</p>
        <label v-if="dialogState.mode === 'prompt'" class="editor-dialog-input-row">
          <span>{{ tr('dialog.inputLabel') }}</span>
          <input ref="dialogInput" v-model="dialogState.value" type="text" :placeholder="dialogState.placeholder" autocomplete="off" spellcheck="false" />
        </label>
        <div class="editor-dialog-actions">
          <button v-if="dialogState.mode !== 'alert'" type="button" @click="cancelDialog">{{ dialogState.cancelLabel }}</button>
          <button ref="dialogPrimaryButton" type="submit" class="primary" :class="{ danger: dialogState.tone === 'danger' }">{{ dialogState.confirmLabel }}</button>
        </div>
      </form>
    </div>

    <div v-if="sshDialog.visible" class="editor-dialog-backdrop" role="presentation" @click.self="closeSshDialog">
      <form class="editor-dialog ssh-dialog" role="dialog" aria-modal="true" aria-labelledby="ssh-dialog-title" @submit.prevent="saveSshDialog" @keydown.esc.prevent.stop="closeSshDialog" @click.stop>
        <div class="editor-dialog-header">
          <span class="codicon codicon-terminal" aria-hidden="true"></span>
          <h2 id="ssh-dialog-title">{{ sshDialog.mode === 'edit' ? tr('ssh.editTitle') : tr('ssh.addTitle') }}</h2>
        </div>
        <label class="setting-row">
          <span>{{ tr('ssh.name') }}</span>
          <input v-model="sshDialog.draft.name" required autocomplete="off" spellcheck="false" />
        </label>
        <div class="ssh-dialog-grid">
          <label class="setting-row">
            <span>{{ tr('ssh.host') }}</span>
            <input v-model="sshDialog.draft.host" required autocomplete="off" spellcheck="false" />
          </label>
          <label class="setting-row">
            <span>{{ tr('ssh.port') }}</span>
            <input v-model.number="sshDialog.draft.port" type="number" min="1" max="65535" required />
          </label>
        </div>
        <label class="setting-row">
          <span>{{ tr('ssh.username') }}</span>
          <input v-model="sshDialog.draft.username" required autocomplete="off" spellcheck="false" />
        </label>
        <label class="setting-row">
          <span>{{ tr('ssh.authType') }}</span>
          <select v-model="sshDialog.draft.authType">
            <option value="password">{{ tr('ssh.authPassword') }}</option>
            <option value="privateKey">{{ tr('ssh.authPrivateKey') }}</option>
          </select>
        </label>
        <label v-if="sshDialog.draft.authType === 'password'" class="setting-row">
          <span>{{ tr('ssh.password') }}</span>
          <input v-model="sshDialog.draft.password" type="password" autocomplete="off" />
        </label>
        <template v-else>
          <label class="setting-row">
            <span>{{ tr('ssh.privateKey') }}</span>
            <textarea v-model="sshDialog.draft.privateKey" rows="5" spellcheck="false"></textarea>
          </label>
          <label class="setting-row">
            <span>{{ tr('ssh.passphrase') }}</span>
            <input v-model="sshDialog.draft.passphrase" type="password" autocomplete="off" />
          </label>
        </template>
        <label class="setting-row checkbox-row">
          <input v-model="sshDialog.draft.exposeToAi" type="checkbox" />
          <span>{{ tr('ssh.exposeToAi') }}</span>
        </label>
        <label class="setting-row">
          <span class="setting-title-row">
            <span>{{ tr('ssh.whitelist') }}</span>
            <button type="button" @click="applySshWhitelistTemplateToDialog">{{ tr('ssh.applyWhitelistTemplate') }}</button>
          </span>
          <textarea v-model="sshDialog.draft.whitelistText" rows="3" spellcheck="false" :placeholder="tr('ssh.whitelistPlaceholder')"></textarea>
        </label>
        <small class="setting-hint">{{ tr('ssh.aiHint') }}</small>
        <div class="editor-dialog-actions">
          <button type="button" @click="closeSshDialog">{{ tr('dialog.cancel') }}</button>
          <button type="submit" class="primary">{{ tr('dialog.ok') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { CdnUtils } from "@/shared/cdn-utils.js";
import { FileUtils } from "@/shared/file-utils.js";
import { MarkdownUtils } from "@/shared/markdown-utils.js";
import { enableEditorPwa } from "@/shared/pwa-install.js";

const STORAGE_KEY = "browser-code-editor-settings";
const SETTINGS_URL_PARAM = "settings";
const REQUEST_PROXY_PATH = "/api/requestProxy";
const SSH_WEBSOCKET_PATH = "/api/ssh/ws";
CdnUtils.loadCodicons().catch((error) => console.error("Failed to load codicons:", error));
const vscodeShortcuts = { save: "Ctrl+S", format: "Shift+Alt+F", commandPalette: "Ctrl+P", search: "Ctrl+Shift+F", findReferences: "Shift+F12", preview: "Ctrl+Shift+V", toggleSidebar: "Ctrl+B", aiComplete: "Ctrl+Shift+Enter" };
const defaultAiSettings = { apiKey: "", baseUrl: "https://api.openai.com/v1", completionModel: "gpt-5.4-mini", agentModel: "gpt-5.5", agentModels: "gpt-5.5,gpt-5.4-mini", reasoningEffort: "default" };
const defaultBackendSettings = { enabled: false, baseUrl: getCurrentBackendBaseUrl() };
const DEFAULT_SSH_WHITELIST_TEMPLATE = [
  "pwd", "ls", "cat", "less", "more", "head", "tail", "grep", "egrep", "fgrep", "awk", "sed", "sort", "uniq", "wc", "cut", "tr", "tee", "xargs", "find", "stat", "file", "readlink", "realpath", "basename", "dirname", "tree",
  "env", "printenv", "set", "locale", "which", "whereis", "type", "command", "history", "alias",
  "whoami", "id", "groups", "who", "w", "last", "lastlog", "date", "uptime", "hostname", "uname", "arch", "lscpu", "lsmem", "lsblk", "lspci", "lsusb", "dmidecode", "dmesg",
  "ps", "pstree", "pgrep", "top", "htop", "free", "vmstat", "iostat", "mpstat", "sar", "pidstat", "pmap", "lsof", "strace",
  "df", "du", "mount", "findmnt", "blkid", "lsattr", "getfacl",
  "ip", "ss", "netstat", "ping", "traceroute", "tracepath", "dig", "nslookup", "host", "curl", "wget", "nc", "telnet", "arp", "route",
  "systemctl", "service", "journalctl", "loginctl", "timedatectl", "resolvectl", "crontab",
  "apt-cache",
].join("\n");
const defaultSshSettings = { securityKey: "", terminalTheme: "dark", whitelistTemplate: DEFAULT_SSH_WHITELIST_TEMPLATE, connections: [] };
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 640;
const DEFAULT_SIDEBAR_WIDTH = 300;
const PREVIEW_MIN_WIDTH = 280;
const PREVIEW_MAX_WIDTH = 900;
const DEFAULT_PREVIEW_WIDTH = 480;
const defaultSettings = { theme: "vs-dark", locale: "zh-CN", fontSize: 14, wordWrap: false, minimap: true, shortcuts: { ...vscodeShortcuts }, ai: { ...defaultAiSettings }, backend: { ...defaultBackendSettings }, ssh: { ...defaultSshSettings } };
const AI_COMPLETION_MANUAL_TRIGGER_WINDOW_MS = 2000;
const AI_COMPLETION_MANUAL_PREFIX_CHARS = 500;
const AI_COMPLETION_MANUAL_SUFFIX_CHARS = 500;
const AI_COMPLETION_MANUAL_MAX_OUTPUT_TOKENS = 512;
const AI_IMAGE_MAX_FILE_SIZE = 20 * 1024 * 1024;
const AI_JAVASCRIPT_DEFAULT_TIMEOUT_MS = 2000;
const AI_JAVASCRIPT_MAX_TIMEOUT_MS = 5000;
const AI_JAVASCRIPT_MAX_CODE_CHARS = 20000;
const AI_JAVASCRIPT_MAX_LOGS = 100;
const AI_AGENTS_FILE_NAME = "AGENTS.md";
const AI_AGENTS_MAX_CHARS = 30000;
const AI_AGENT_MAX_TOOL_CALL_ROUNDS = 25;
const SSH_OUTPUT_MAX_CHARS = 120000;
const SSH_COMMAND_OUTPUT_WAIT_MS = 700;
const SSH_CONNECT_TIMEOUT_MS = 15000;
const WORKSPACE_MODEL_MAX_FILE_SIZE = 5 * 1024 * 1024;
const WORKSPACE_FILE_ACTION_LIMIT = 1000;
const WORKSPACE_REFERENCE_FILE_LIMIT = 2000;
const WORKSPACE_REFERENCE_RESULT_LIMIT = 1000;
const WORKSPACE_SEARCH_FILE_LIMIT = 3000;
const WORKSPACE_SEARCH_RESULT_LIMIT = 500;
let monaco = null;
let prettierStandalonePromise = null;
const prettierPluginPromises = new Map();
let aiCompletionRequestSerial = 0;
let aiCompletionInFlight = false;
let aiCompletionManualUntil = 0;
let aiCompletionAbortController = null;
let monacoLanguageIndex = null;

window.process ||= { env: {} };

const messages = {
  "zh-CN": {
    "nav.main": "主导航",
    "activity.explorer": "资源管理器",
    "activity.search": "搜索",
    "activity.changes": "变更",
    "activity.ai": "AI 助手",
    "activity.ssh": "SSH",
    "activity.settings": "设置",
    "panel.files": "文件",
    "panel.search": "搜索",
    "panel.changes": "变更",
    "panel.ai": "AI 助手",
    "panel.ssh": "SSH 连接",
    "panel.settings": "设置",
    "commandCenter.placeholder": "搜索命令或文件...",
    "commandCenter.title": "打开命令面板",
    "action.openFolder": "打开文件夹",
    "action.newFile": "新建文件",
    "action.newFolder": "新建文件夹",
    "action.newFilePending": "新建文件（待保存）",
    "action.delete": "删除",
    "action.deletePending": "删除文件（待保存）",
    "action.revert": "回滚更改",
    "action.refreshTree": "刷新文件树",
    "action.close": "关闭",
    "action.save": "保存",
    "action.format": "格式化文档",
    "action.findReferences": "查找引用",
    "action.preview": "预览",
    "action.toggleSidebar": "切换侧边栏",
    "action.aiComplete": "AI 代码补全",
    "dialog.alertTitle": "提示",
    "dialog.confirmTitle": "请确认",
    "dialog.promptTitle": "请输入",
    "dialog.ok": "确定",
    "dialog.cancel": "取消",
    "dialog.close": "关闭",
    "dialog.inputLabel": "内容",
    "settings.theme": "主题",
    "settings.locale": "界面语言",
    "settings.ai": "AI",
    "settings.aiApiKey": "API Key",
    "settings.aiApiKeyPlaceholder": "仅保存在当前浏览器 localStorage",
    "settings.aiBaseUrl": "Base URL",
    "settings.aiFetchModels": "从 API 拉取模型",
    "settings.aiModelsLoading": "正在拉取模型...",
    "settings.aiCompletionModel": "补全模型",
    "settings.aiAgentModel": "Agent 模型",
    "settings.aiAgentModelsPlaceholder": "用逗号分隔，例如 gpt-5.5,gpt-5.4-mini",
    "settings.aiAgentModelToAdd": "选择模型添加",
    "settings.aiAddAgentModel": "添加",
    "settings.aiHint": "当前直接从浏览器请求 OpenAI-compatible API，Base URL 可填根地址或 /v1 地址；适合本机自用，公开部署会暴露 API Key。",
    "settings.backend": "后端服务器",
    "settings.backendEnabled": "启用后端服务器",
    "settings.backendBaseUrl": "后端地址",
    "settings.backendHint": "用于 request_proxy、SSH 等需要后端转发或连接的工具。默认地址是当前页面同源后端；未启用时相关功能不可用。",
    "settings.sshSecurityKey": "SSH 安全密钥",
    "settings.sshSecurityKeyPlaceholder": "如果后端配置了 ssh.securityKey，则需要填写",
    "settings.sshTerminalTheme": "SSH 终端配色",
    "settings.sshWhitelistTemplate": "SSH 白名单模板",
    "settings.resetSshWhitelistTemplate": "恢复默认白名单模板",
    "settings.keybindings": "快捷键映射",
    "settings.resetKeybindings": "恢复默认",
    "settings.shortcutHint": "默认采用 VS Code 快捷键。可输入 Ctrl/Cmd/Shift/Alt 加按键，例如 Ctrl+S、Shift+Alt+F。",
    "settings.fontSize": "字体大小",
    "settings.wordWrap": "自动换行",
    "settings.minimap": "显示 Minimap",
    "settings.exportUrl": "导出设置 URL",
    "settings.copyExportUrl": "复制导出 URL",
    "settings.exportUrlHint": "导出 URL 会包含完整设置 JSON，包括 API Key。只分享给可信对象。访问带 settings 参数的 URL 会覆盖本地设置。",
    "settings.exportUrlCopied": "导出 URL 已复制",
    "workspace.none": "未打开文件夹",
    "workspace.treeEmpty": "尚未载入文件树",
    "changes.none": "没有未保存的变更",
    "changes.openDiff": "打开对比",
    "changes.deleted": "待删除",
    "changes.selectChange": "选择变更",
    "changes.selectAll": "全选",
    "changes.selectedCount": "已选 {count}",
    "changes.saveSelected": "保存所选",
    "changes.revertSelected": "回滚所选",
    "changes.batchSaved": "已保存 {count} 个变更",
    "changes.batchReverted": "已回滚 {count} 个变更",
    "search.placeholder": "搜索",
    "search.replacePlaceholder": "替换",
    "search.submit": "搜索",
    "search.replaceAll": "全部替换",
    "search.matchCase": "区分大小写",
    "search.running": "正在搜索...",
    "search.empty": "输入内容后在工作区中搜索。",
    "search.noResults": "没有结果",
    "search.clear": "清空搜索结果",
    "search.results": "{count} 个结果",
    "search.replaced": "已替换 {count} 处",
    "empty.title": "打开一个目录，然后选择文件",
    "empty.description": "此编辑器使用 Monaco Editor 和浏览器 File System Access API 直接读写本地文件。",
    "editor.aria": "代码编辑器",
    "diff.aria": "变更对比编辑器",
    "status.ready": "Ready",
    "status.loaded": "Monaco Editor loaded",
    "status.language": "切换当前文件语言",
    "status.unsaved": "未保存",
    "status.saved": "已保存",
    "status.saveButton": "保存 {shortcut}",
    "status.openedFolder": "已打开 {name}",
    "status.permissionGranted": "读写权限已授予",
    "status.refreshed": "已刷新 {name}",
    "status.itemCount": "{count} 项",
    "status.openedFile": "已打开 {name}",
    "status.savedFile": "已保存 {name}",
    "status.deleted": "已删除 {path}",
    "status.pendingCreate": "已标记新建 {path}",
    "status.pendingDelete": "已标记删除 {path}",
    "status.reverted": "已回滚 {path}",
    "status.diff": "正在对比 {path}",
    "status.shortcutInvalid": "快捷键无效：{shortcut}",
    "status.shortcutUpdated": "快捷键已更新",
    "status.formatted": "已格式化 {language}",
    "status.formatUnavailable": "当前语言没有可用格式化器",
    "status.aiCompleted": "AI 任务完成",
    "status.aiStopped": "AI 任务已停止",
    "status.aiChangedFile": "AI 已修改 {path}",
    "status.aiModelsLoaded": "已拉取 {count} 个模型",
    "ai.empty": "告诉 AI 你想做什么，它会尽力帮你完成。",
    "ai.placeholder": "描述你想让 AI 完成的修改...",
    "ai.send": "发送",
    "ai.running": "运行中...",
    "ai.stop": "停止 AI 任务",
    "ai.contextLength": "上次用量 {count}",
    "ai.usageNotMeasured": "未统计",
    "ai.usageMeasured": "输入 {input} / 输出 {output} / 合计 {total} tokens{cache}",
    "ai.usageCache": " / 缓存 {cached} ({rate}%)",
    "ai.usageCacheMiss": " / 缓存 未命中",
    "ai.compressContext": "压缩上下文",
    "ai.contextCompressed": "上下文已压缩",
    "ai.contextSummaryTitle": "上下文摘要",
    "ai.resetConversation": "重置对话",
    "ai.conversationReset": "当前对话已重置",
    "ai.session": "会话",
    "ai.defaultSessionTitle": "会话 {count}",
    "ai.newSession": "新建会话",
    "ai.deleteSession": "删除会话",
    "ai.sessionCreated": "已新建会话",
    "ai.sessionDeleted": "会话已删除",
    "ai.agentModel": "对话模型",
    "ai.reasoningEffort": "思考等级",
    "ai.reasoning.default": "默认",
    "ai.reasoning.low": "低",
    "ai.reasoning.medium": "中",
    "ai.reasoning.high": "高",
    "ai.reasoning.xhigh": "极高",
    "ai.role.user": "你",
    "ai.role.assistant": "AI",
    "ai.role.tool": "工具",
    "ai.toolArgs": "入参",
    "ai.toolResult": "结果",
    "ai.error.missingConfig": "请先在设置中填写 API Key 和模型。",
    "ai.error.missingApiKey": "请先在设置中填写 API Key。",
    "ai.error.noWorkspace": "请先打开工作区。",
    "ai.error.backendDisabled": "后端服务器未启用，请先在设置中启用后端服务器。",
    "ai.error.invalidBackendBaseUrl": "后端地址不合法。",
    "ssh.add": "添加 SSH",
    "ssh.addTitle": "添加 SSH 设置",
    "ssh.editTitle": "修改 SSH 设置",
    "ssh.empty": "还没有 SSH 设置。",
    "ssh.disabledTitle": "SSH 功能未启用",
    "ssh.disabledDescription": "请先在设置中启用后端服务器并配置后端地址。",
    "ssh.name": "名称",
    "ssh.host": "地址",
    "ssh.port": "端口",
    "ssh.username": "用户名",
    "ssh.authType": "登录方式",
    "ssh.authPassword": "账号密码登录",
    "ssh.authPrivateKey": "SSH 私钥登录",
    "ssh.password": "密码",
    "ssh.privateKey": "私钥",
    "ssh.passphrase": "私钥密码短语",
    "ssh.exposeToAi": "允许 AI 使用此连接",
    "ssh.whitelist": "AI 白名单主命令",
    "ssh.whitelistPlaceholder": "每行一个主命令，例如：ls\npwd\ngit",
    "ssh.applyWhitelistTemplate": "填入模板",
    "ssh.aiHint": "AI 只能看到已暴露的 SSH 配置。AI 执行命令时必须提供主命令列表；列表里有白名单外主命令就需要授权。高风险命令即使在白名单内也会要求授权。",
    "ssh.aiExposed": "AI 可使用",
    "ssh.aiHidden": "仅手动使用",
    "ssh.connected": "已连接",
    "ssh.disconnected": "未连接",
    "ssh.connect": "连接",
    "ssh.disconnect": "断开",
    "ssh.edit": "修改",
    "ssh.delete": "删除",
    "ssh.terminal": "SSH 终端",
    "ssh.noOutput": "暂无 SSH 输出。",
    "ssh.commandPlaceholder": "输入命令后回车执行",
    "ssh.run": "执行",
    "ssh.connecting": "正在连接 {name}",
    "ssh.connectedStatus": "SSH 已连接 {name}",
    "ssh.closedStatus": "SSH 已断开 {name}",
    "ssh.connectFailedStatus": "SSH 连接失败",
    "ssh.connectFailed": "SSH 连接失败",
    "ssh.deletedStatus": "已删除 SSH 设置 {name}",
    "ssh.confirmDelete": "确定删除 SSH 设置“{name}”吗？",
    "ssh.confirmUnauthorizedCommand": "AI 请求执行白名单外 SSH 命令，需要授权。\n\n连接：{name}\n主命令：{commands}\n说明：{reason}\n命令：{command}",
    "ssh.confirmHighRiskCommand": "AI 请求执行高风险 SSH 命令，即使它在白名单内也需要授权。\n\n连接：{name}\n主命令：{commands}\n说明：{reason}\n命令：{command}",
    "ssh.toolExecutedCommand": "已执行 SSH 命令：{command}\n用途：{reason}",
    "ssh.error.required": "请填写 SSH 名称、地址和用户名。",
    "ssh.error.backendDisabled": "后端服务器未启用，SSH 功能不可用。",
    "ssh.error.notExposed": "该 SSH 设置未允许 AI 使用。",
    "ssh.error.commandReasonRequired": "AI 执行 SSH 命令时必须说明用途。",
    "ssh.error.commandListRequired": "AI 执行 SSH 命令时必须提供主命令列表。",
    "ssh.error.commandRejected": "SSH 命令授权已拒绝。",
    "menu.fileTree": "文件树菜单",
    "menu.changes": "变更菜单",
    "menu.editor": "编辑器菜单",
    "editorMenu.cut": "剪切",
    "editorMenu.copy": "复制",
    "editorMenu.paste": "粘贴",
    "editorMenu.format": "格式化文档",
    "editorMenu.find": "查找",
    "editorMenu.selectAll": "全选",
    "editorMenu.commandPalette": "命令面板",
    "confirm.binary": "“{name}” 可能不是文本文件或体积较大，仍要尝试打开吗？",
    "confirm.delete": "确定删除“{path}”吗？{folderHint}{dirtyHint}",
    "confirm.deleteFolderHint": "\n\n该文件夹会被递归删除。",
    "confirm.deleteDirtyHint": "\n\n包含 {count} 个未保存标签，删除后这些修改会丢失。",
    "confirm.revert": "确定回滚“{path}”的未保存修改吗？",
    "confirm.revertSelected": "确定回滚所选 {count} 个未保存变更吗？",
    "confirm.deleteAiSession": "确定删除当前 AI 会话吗？此操作不会回滚文件修改。",
    "confirm.leaveWithSsh": "当前存在未保存内容或活跃 SSH 连接，离开后 SSH 连接会被断开。确定离开吗？",
    "imagePreview.aria": "图片预览",
    "imagePreview.type": "图片",
    "unsupportedFile.aria": "不支持文件预览",
    "unsupportedFile.title": "不支持预览当前文件",
    "unsupportedFile.description": "此文件不是可编辑文本，编辑器不会读取或修改内容。你仍然可以关闭、标记删除并保存删除。",
    "unsupportedFile.type": "不支持预览",
    "diff.unsupportedTitle": "文件内容不支持对比预览",
    "diff.unsupportedDescription": "此文件有变更，但当前编辑器无法展示具体内容差异。保存后会应用文件级操作。",
    "preview.aria": "文件预览",
    "preview.html": "HTML 预览",
    "preview.markdown": "Markdown 预览",
    "prompt.newFile": "输入新文件路径",
    "prompt.newFolder": "输入新文件夹路径",
    "error.unsupportedBrowser": "当前浏览器不支持 File System Access API。请使用 Chrome、Edge 或 Arc，并通过 localhost 或 HTTPS 打开页面。",
    "error.createFile": "新建文件失败",
    "error.createFolder": "新建文件夹失败",
    "error.openFolder": "打开文件夹失败",
    "error.refreshTree": "刷新文件树失败",
    "error.openFile": "打开文件失败",
    "error.saveFile": "保存文件失败",
    "error.delete": "删除失败",
    "error.format": "格式化失败",
    "error.invalidPath": "路径不合法",
    "error.invalidName": "名称不合法",
    "error.unsupportedFile": "不支持打开该文件类型",
    "shortcut.save": "保存",
    "shortcut.format": "格式化文档",
    "shortcut.commandPalette": "命令面板",
    "shortcut.search": "全局搜索",
    "shortcut.findReferences": "查找引用",
    "shortcut.preview": "预览",
    "shortcut.toggleSidebar": "切换侧边栏",
    "shortcut.aiComplete": "AI 代码补全",
  },
  "en-US": {
    "nav.main": "Main Navigation",
    "activity.explorer": "Explorer",
    "activity.search": "Search",
    "activity.changes": "Changes",
    "activity.ai": "AI Assistant",
    "activity.ssh": "SSH",
    "activity.settings": "Settings",
    "panel.files": "Files",
    "panel.search": "Search",
    "panel.changes": "Changes",
    "panel.ai": "AI Assistant",
    "panel.ssh": "SSH Connections",
    "panel.settings": "Settings",
    "commandCenter.placeholder": "Search commands or files...",
    "commandCenter.title": "Open Command Palette",
    "action.openFolder": "Open Folder",
    "action.newFile": "New File",
    "action.newFolder": "New Folder",
    "action.newFilePending": "New File (Pending Save)",
    "action.delete": "Delete",
    "action.deletePending": "Delete File (Pending Save)",
    "action.revert": "Revert Changes",
    "action.refreshTree": "Refresh Tree",
    "action.close": "Close",
    "action.save": "Save",
    "action.format": "Format Document",
    "action.findReferences": "Find References",
    "action.preview": "Preview",
    "action.toggleSidebar": "Toggle Sidebar",
    "action.aiComplete": "AI Code Completion",
    "dialog.alertTitle": "Notice",
    "dialog.confirmTitle": "Confirm",
    "dialog.promptTitle": "Input",
    "dialog.ok": "OK",
    "dialog.cancel": "Cancel",
    "dialog.close": "Close",
    "dialog.inputLabel": "Value",
    "settings.theme": "Theme",
    "settings.locale": "Display Language",
    "settings.ai": "AI",
    "settings.aiApiKey": "API Key",
    "settings.aiApiKeyPlaceholder": "Stored only in this browser localStorage",
    "settings.aiBaseUrl": "Base URL",
    "settings.aiFetchModels": "Fetch Models from API",
    "settings.aiModelsLoading": "Fetching models...",
    "settings.aiCompletionModel": "Completion Model",
    "settings.aiAgentModel": "Agent Model",
    "settings.aiAgentModelsPlaceholder": "Comma-separated, for example gpt-5.5,gpt-5.4-mini",
    "settings.aiAgentModelToAdd": "Select model to add",
    "settings.aiAddAgentModel": "Add",
    "settings.aiHint": "Requests are sent directly from the browser to an OpenAI-compatible API. Base URL can be the root or /v1 URL. This is suitable for local use; public deployment exposes the API key.",
    "settings.backend": "Backend Server",
    "settings.backendEnabled": "Enable Backend Server",
    "settings.backendBaseUrl": "Backend URL",
    "settings.backendHint": "Used by tools that need backend forwarding or connections, such as request_proxy and SSH. The default URL is the current same-origin backend; related features are unavailable while disabled.",
    "settings.sshSecurityKey": "SSH Security Key",
    "settings.sshSecurityKeyPlaceholder": "Required if backend ssh.securityKey is configured",
    "settings.sshTerminalTheme": "SSH Terminal Theme",
    "settings.sshWhitelistTemplate": "SSH Whitelist Template",
    "settings.resetSshWhitelistTemplate": "Reset Whitelist Template",
    "settings.keybindings": "Keyboard Shortcuts",
    "settings.resetKeybindings": "Reset",
    "settings.shortcutHint": "VS Code shortcuts are used by default. Use Ctrl/Cmd/Shift/Alt plus a key, for example Ctrl+S or Shift+Alt+F.",
    "settings.fontSize": "Font Size",
    "settings.wordWrap": "Word Wrap",
    "settings.minimap": "Show Minimap",
    "settings.exportUrl": "Export Settings URL",
    "settings.copyExportUrl": "Copy Export URL",
    "settings.exportUrlHint": "The exported URL contains the full settings JSON, including API keys. Share it only with trusted recipients. Visiting a URL with the settings parameter overwrites local settings.",
    "settings.exportUrlCopied": "Export URL copied",
    "workspace.none": "No Folder Opened",
    "workspace.treeEmpty": "No file tree loaded",
    "changes.none": "No unsaved changes",
    "changes.openDiff": "Open Diff",
    "changes.deleted": "Pending delete",
    "changes.selectChange": "Select change",
    "changes.selectAll": "Select all",
    "changes.selectedCount": "Selected {count}",
    "changes.saveSelected": "Save Selected",
    "changes.revertSelected": "Revert Selected",
    "changes.batchSaved": "Saved {count} change(s)",
    "changes.batchReverted": "Reverted {count} change(s)",
    "search.placeholder": "Search",
    "search.replacePlaceholder": "Replace",
    "search.submit": "Search",
    "search.replaceAll": "Replace All",
    "search.matchCase": "Match Case",
    "search.running": "Searching...",
    "search.empty": "Enter text to search in the workspace.",
    "search.noResults": "No results",
    "search.clear": "Clear Search Results",
    "search.results": "{count} results",
    "search.replaced": "Replaced {count} occurrence(s)",
    "empty.title": "Open a folder, then choose a file",
    "empty.description": "This editor uses Monaco Editor and the browser File System Access API to read and write local files.",
    "editor.aria": "Code editor",
    "diff.aria": "Diff editor",
    "status.ready": "Ready",
    "status.loaded": "Monaco Editor loaded",
    "status.language": "Switch current file language",
    "status.unsaved": "Unsaved",
    "status.saved": "Saved",
    "status.saveButton": "Save {shortcut}",
    "status.openedFolder": "Opened {name}",
    "status.permissionGranted": "Read/write permission granted",
    "status.refreshed": "Refreshed {name}",
    "status.itemCount": "{count} items",
    "status.openedFile": "Opened {name}",
    "status.savedFile": "Saved {name}",
    "status.deleted": "Deleted {path}",
    "status.pendingCreate": "Marked {path} as new",
    "status.pendingDelete": "Marked {path} for deletion",
    "status.reverted": "Reverted {path}",
    "status.diff": "Comparing {path}",
    "status.shortcutInvalid": "Invalid shortcut: {shortcut}",
    "status.shortcutUpdated": "Shortcuts updated",
    "status.formatted": "Formatted {language}",
    "status.formatUnavailable": "No formatter is available for this language",
    "status.aiCompleted": "AI task completed",
    "status.aiStopped": "AI task stopped",
    "status.aiChangedFile": "AI changed {path}",
    "status.aiModelsLoaded": "Loaded {count} models",
    "ai.empty": "Enter a request to use AI. File read, search, and edit tools are unavailable until a folder is opened.",
    "ai.placeholder": "Describe the change you want AI to make...",
    "ai.send": "Send",
    "ai.running": "Running...",
    "ai.stop": "Stop AI task",
    "ai.contextLength": "Last usage {count}",
    "ai.usageNotMeasured": "not measured",
    "ai.usageMeasured": "in {input} / out {output} / total {total} tokens{cache}",
    "ai.usageCache": " / cached {cached} ({rate}%)",
    "ai.usageCacheMiss": " / cache miss",
    "ai.compressContext": "Compress Context",
    "ai.contextCompressed": "Context compressed",
    "ai.contextSummaryTitle": "Context Summary",
    "ai.resetConversation": "Reset Chat",
    "ai.conversationReset": "Current chat reset",
    "ai.session": "Session",
    "ai.defaultSessionTitle": "Session {count}",
    "ai.newSession": "New Session",
    "ai.deleteSession": "Delete Session",
    "ai.sessionCreated": "Session created",
    "ai.sessionDeleted": "Session deleted",
    "ai.agentModel": "Chat Model",
    "ai.reasoningEffort": "Reasoning",
    "ai.reasoning.default": "Default",
    "ai.reasoning.low": "Low",
    "ai.reasoning.medium": "Medium",
    "ai.reasoning.high": "High",
    "ai.reasoning.xhigh": "XHigh",
    "ai.role.user": "You",
    "ai.role.assistant": "AI",
    "ai.role.tool": "Tool",
    "ai.toolArgs": "Arguments",
    "ai.toolResult": "Result",
    "ai.error.missingConfig": "Fill in API key and model in Settings first.",
    "ai.error.missingApiKey": "Fill in API key in Settings first.",
    "ai.error.noWorkspace": "Open a workspace first.",
    "ai.error.backendDisabled": "Backend server is disabled. Enable it in Settings first.",
    "ai.error.invalidBackendBaseUrl": "Invalid backend URL.",
    "ssh.add": "Add SSH",
    "ssh.addTitle": "Add SSH Setting",
    "ssh.editTitle": "Edit SSH Setting",
    "ssh.empty": "No SSH settings yet.",
    "ssh.disabledTitle": "SSH is disabled",
    "ssh.disabledDescription": "Enable the backend server and configure its URL in Settings first.",
    "ssh.name": "Name",
    "ssh.host": "Host",
    "ssh.port": "Port",
    "ssh.username": "Username",
    "ssh.authType": "Login Method",
    "ssh.authPassword": "Password login",
    "ssh.authPrivateKey": "SSH key login",
    "ssh.password": "Password",
    "ssh.privateKey": "Private Key",
    "ssh.passphrase": "Passphrase",
    "ssh.exposeToAi": "Allow AI to use this connection",
    "ssh.whitelist": "AI Main Command Whitelist",
    "ssh.whitelistPlaceholder": "One main command per line, for example:\nls\npwd\ngit",
    "ssh.applyWhitelistTemplate": "Use Template",
    "ssh.aiHint": "AI can only see exposed SSH settings. AI must provide a main-command list when executing commands; any main command outside the whitelist requires approval. High-risk commands require approval even when whitelisted.",
    "ssh.aiExposed": "AI allowed",
    "ssh.aiHidden": "Manual only",
    "ssh.connected": "Connected",
    "ssh.disconnected": "Disconnected",
    "ssh.connect": "Connect",
    "ssh.disconnect": "Disconnect",
    "ssh.edit": "Edit",
    "ssh.delete": "Delete",
    "ssh.terminal": "SSH Terminal",
    "ssh.noOutput": "No SSH output yet.",
    "ssh.commandPlaceholder": "Enter a command and press Enter",
    "ssh.run": "Run",
    "ssh.connecting": "Connecting {name}",
    "ssh.connectedStatus": "SSH connected {name}",
    "ssh.closedStatus": "SSH disconnected {name}",
    "ssh.connectFailedStatus": "SSH connection failed",
    "ssh.connectFailed": "SSH connection failed",
    "ssh.deletedStatus": "Deleted SSH setting {name}",
    "ssh.confirmDelete": "Delete SSH setting “{name}”?",
    "ssh.confirmUnauthorizedCommand": "AI requests to run an SSH command outside the whitelist. Approval is required.\n\nConnection: {name}\nMain commands: {commands}\nReason: {reason}\nCommand: {command}",
    "ssh.confirmHighRiskCommand": "AI requests to run a high-risk SSH command. Approval is required even if it is whitelisted.\n\nConnection: {name}\nMain commands: {commands}\nReason: {reason}\nCommand: {command}",
    "ssh.toolExecutedCommand": "Executed SSH command: {command}\nPurpose: {reason}",
    "ssh.error.required": "Fill in SSH name, host, and username.",
    "ssh.error.backendDisabled": "Backend server is disabled, so SSH is unavailable.",
    "ssh.error.notExposed": "This SSH setting is not exposed to AI.",
    "ssh.error.commandReasonRequired": "AI must explain the purpose before running SSH commands.",
    "ssh.error.commandListRequired": "AI must provide a main-command list before running SSH commands.",
    "ssh.error.commandRejected": "SSH command approval was rejected.",
    "menu.fileTree": "File tree menu",
    "menu.changes": "Changes menu",
    "menu.editor": "Editor menu",
    "editorMenu.cut": "Cut",
    "editorMenu.copy": "Copy",
    "editorMenu.paste": "Paste",
    "editorMenu.format": "Format Document",
    "editorMenu.find": "Find",
    "editorMenu.selectAll": "Select All",
    "editorMenu.commandPalette": "Command Palette",
    "confirm.binary": "“{name}” may be a binary or large file. Try opening it anyway?",
    "confirm.delete": "Delete “{path}”?{folderHint}{dirtyHint}",
    "confirm.deleteFolderHint": "\n\nThis folder will be deleted recursively.",
    "confirm.deleteDirtyHint": "\n\nIt contains {count} unsaved tab(s). Those changes will be lost.",
    "confirm.revert": "Revert unsaved changes in “{path}”?",
    "confirm.revertSelected": "Revert {count} selected unsaved change(s)?",
    "confirm.deleteAiSession": "Delete the current AI session? This will not revert file changes.",
    "confirm.leaveWithSsh": "There are unsaved changes or active SSH connections. SSH connections will be disconnected if you leave. Leave this page?",
    "imagePreview.aria": "Image Preview",
    "imagePreview.type": "Image",
    "unsupportedFile.aria": "Unsupported File Preview",
    "unsupportedFile.title": "Preview is not supported for this file",
    "unsupportedFile.description": "This file is not editable text, so the editor will not read or change its content. You can still close it, mark it for deletion, and save the deletion.",
    "unsupportedFile.type": "Unsupported preview",
    "diff.unsupportedTitle": "File content diff is not supported",
    "diff.unsupportedDescription": "This file has changes, but the editor cannot display a content diff. Saving will apply the file-level operation.",
    "preview.aria": "File Preview",
    "preview.html": "HTML Preview",
    "preview.markdown": "Markdown Preview",
    "prompt.newFile": "Enter new file path",
    "prompt.newFolder": "Enter new folder path",
    "error.unsupportedBrowser": "This browser does not support the File System Access API. Use Chrome, Edge, or Arc, and open the page from localhost or HTTPS.",
    "error.createFile": "Failed to create file",
    "error.createFolder": "Failed to create folder",
    "error.openFolder": "Failed to open folder",
    "error.refreshTree": "Failed to refresh file tree",
    "error.openFile": "Failed to open file",
    "error.saveFile": "Failed to save file",
    "error.delete": "Failed to delete",
    "error.format": "Failed to format",
    "error.invalidPath": "Invalid path",
    "error.invalidName": "Invalid name",
    "error.unsupportedFile": "Unsupported file type",
    "shortcut.save": "Save",
    "shortcut.format": "Format Document",
    "shortcut.commandPalette": "Command Palette",
    "shortcut.search": "Global Search",
    "shortcut.findReferences": "Find References",
    "shortcut.preview": "Preview",
    "shortcut.toggleSidebar": "Toggle Sidebar",
    "shortcut.aiComplete": "AI Code Completion",
  },
};

const languageOptions = [
  ["plaintext", "Plain Text"], ["javascript", "JavaScript"], ["flow", "Flow"], ["typescript", "TypeScript"], ["html", "HTML"], ["vue", "Vue"], ["angular", "Angular"], ["handlebars", "Handlebars"], ["css", "CSS"], ["scss", "SCSS"], ["less", "Less"], ["json", "JSON"], ["jsonc", "JSONC"], ["json5", "JSON5"], ["markdown", "Markdown"], ["mdx", "MDX"], ["graphql", "GraphQL"], ["yaml", "YAML"], ["python", "Python"], ["go", "Go"], ["rust", "Rust"], ["java", "Java"], ["c", "C"], ["cpp", "C++"], ["csharp", "C#"], ["bat", "Batch"], ["dart", "Dart"], ["fsharp", "F#"], ["ini", "INI"], ["kotlin", "Kotlin"], ["php", "PHP"], ["r", "R"], ["ruby", "Ruby"], ["shell", "Shell"], ["powershell", "PowerShell"], ["sql", "SQL"], ["swift", "Swift"], ["xml", "XML"], ["dockerfile", "Dockerfile"], ["lua", "Lua"],
].map(([id, label]) => ({ id, label }));

const aiReasoningEfforts = ["default", "low", "medium", "high", "xhigh"];
const renderMarkdown = MarkdownUtils.renderMarkdown;

const sshTerminalThemes = {
  dark: { background: "#1e1e1e", foreground: "#cccccc", cursor: "#ffffff", selectionBackground: "#264f78" },
  light: { background: "#ffffff", foreground: "#1f1f1f", cursor: "#1f1f1f", selectionBackground: "#add6ff" },
  solarizedDark: { background: "#002b36", foreground: "#839496", cursor: "#93a1a1", selectionBackground: "#073642" },
  monokai: { background: "#272822", foreground: "#f8f8f2", cursor: "#f8f8f0", selectionBackground: "#49483e" },
};

const sshTerminalThemeOptions = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "solarizedDark", label: "Solarized Dark" },
  { value: "monokai", label: "Monokai" },
];

const shortcutItems = [
  { key: "save", labelKey: "shortcut.save" },
  { key: "format", labelKey: "shortcut.format" },
  { key: "commandPalette", labelKey: "shortcut.commandPalette" },
  { key: "search", labelKey: "shortcut.search" },
  { key: "findReferences", labelKey: "shortcut.findReferences" },
  { key: "preview", labelKey: "shortcut.preview" },
  { key: "toggleSidebar", labelKey: "shortcut.toggleSidebar" },
  { key: "aiComplete", labelKey: "shortcut.aiComplete" },
];

const TreeList = defineComponent({
  name: "TreeList",
  props: { nodes: Array, depth: Number, activePath: String, collapsedPaths: Object, dirtyPaths: Object },
  emits: ["open-file", "toggle-dir", "context-node"],
  setup(props, { emit }) {
    return () => h("ul", { class: "tree-list" }, props.nodes.map((node) => {
      const collapsed = node.kind === "directory" && props.collapsedPaths.has(node.path);
      const row = h("button", {
        class: ["tree-row", { active: node.path === props.activePath }],
        style: { paddingLeft: `${8 + props.depth * 14}px` },
        title: node.path,
        "aria-expanded": node.kind === "directory" ? String(!collapsed) : "false",
        onClick: () => node.kind === "directory" ? emit("toggle-dir", node.path) : emit("open-file", node),
        onContextmenu: (event) => { event.preventDefault(); event.stopPropagation(); emit("context-node", event, node); },
      }, [
        h("span", { class: ["chevron", "codicon", node.kind === "directory" ? (collapsed ? "codicon-chevron-right" : "codicon-chevron-down") : ""] }),
        h("span", { class: ["icon", "codicon", getTreeIconClass(node, collapsed)] }),
        h("span", { class: "name" }, node.name),
        isDirtyTreeNode(node, props.dirtyPaths) ? h("span", { class: "tree-dirty" }, "•") : null,
      ]);
      return h("li", { key: node.path }, [row, node.kind === "directory" && node.children.length && !collapsed ? h(TreeList, { nodes: node.children, depth: props.depth + 1, activePath: props.activePath, collapsedPaths: props.collapsedPaths, dirtyPaths: props.dirtyPaths, onOpenFile: (file) => emit("open-file", file), onToggleDir: (path) => emit("toggle-dir", path), onContextNode: (event, item) => emit("context-node", event, item) }) : null]);
    }));
  },
});

function isDirtyTreeNode(node, dirtyPaths) {
  if (!dirtyPaths) return false;
  if (node.kind === "file") return dirtyPaths.has(node.path);
  return Array.from(dirtyPaths).some((path) => path.startsWith(`${node.path}/`));
}

const editorHost = ref(null);
const diffHost = ref(null);
const aiMessagesEl = ref(null);
const sshTerminalHost = ref(null);
const editor = shallowRef(null);
const diffEditor = shallowRef(null);
const rootHandle = shallowRef(null);
const rootName = ref("");
const diskTree = shallowRef([]);
const collapsedPaths = reactive(new Set());
const openFiles = reactive(new Map());
const selectedChangePaths = reactive(new Set());
const activePath = ref("");
const activeDiffPath = ref("");
const previewVisible = ref(false);
const previewContent = ref("");
const previewFrameKey = ref(0);
const dirtyRevision = ref(0);
const activeView = ref("explorer");
const sidePanelVisible = ref(true);
const sidebarResizing = ref(false);
const previewResizing = ref(false);
const sidebarWidth = ref(DEFAULT_SIDEBAR_WIDTH);
const previewWidth = ref(DEFAULT_PREVIEW_WIDTH);
const keybindingDisposables = [];
const inlineCompletionDisposables = [];
const referenceProviderDisposables = [];
const workspaceFileActionDisposables = [];
const workspaceModelPaths = new Set();
const workspaceModelPromises = new Map();
const status = reactive({ left: "Ready", right: "Monaco Editor" });
const contextMenu = reactive({ visible: false, x: 0, y: 0, node: null });
const changesContextMenu = reactive({ visible: false, x: 0, y: 0, file: null });
const dialogInput = ref(null);
const dialogPrimaryButton = ref(null);
const dialogState = reactive({ visible: false, mode: "alert", title: "", message: "", value: "", placeholder: "", confirmLabel: "", cancelLabel: "", tone: "default", selectOnFocus: false });
const settings = reactive(loadSettings());
const sshSessions = reactive(new Map());
const activeSshTerminalId = ref("");
const sshRevision = ref(0);
const sshDialog = reactive({ visible: false, mode: "create", draft: createSshDraft() });
let disableEditorPwa = null;
let aiSessionSerial = 0;
const aiSessions = reactive([createAiSession()]);
const activeAiSessionId = ref(aiSessions[0].id);
const activeAiSession = computed(() => aiSessions.find((session) => session.id === activeAiSessionId.value) || aiSessions[0] || null);
const aiMessages = computed(() => activeAiSession.value?.messages || []);
const aiPrompt = computed({
  get: () => activeAiSession.value?.prompt || "",
  set: (value) => { getActiveAiSession().prompt = value; },
});
const aiBusy = ref(false);
const aiAbortController = shallowRef(null);
const aiAvailableModels = ref([]);
const aiModelsLoading = ref(false);
const agentsMdContent = ref("");
const aiContextUsage = shallowRef(null);
const agentModelToAdd = ref("");
const searchQuery = ref("");
const searchReplaceText = ref("");
const searchMatchCase = ref(false);
const searchResults = ref([]);
const searchBusy = ref(false);
const searchSearched = ref(false);
let searchSerial = 0;
const aiAgentModelOptions = computed(() => {
  const configured = parseCommaList(settings.ai.agentModels);
  return uniqueStrings(configured.length ? configured : [settings.ai.agentModel, defaultAiSettings.agentModel]);
});
const aiModelOptions = computed(() => uniqueStrings([settings.ai.completionModel, ...aiAgentModelOptions.value, defaultAiSettings.completionModel, ...aiAvailableModels.value]));
const aiContextLength = computed(() => formatAiUsage(aiContextUsage.value));
const canResetAiConversation = computed(() => Boolean(aiPrompt.value.trim() || aiMessages.value.length || getAiTouchedFiles().length));
const tree = computed(() => {
  dirtyRevision.value;
  return mergePendingFilesIntoTree(diskTree.value, Array.from(openFiles.values()).filter((file) => file.isNew || file.deleted));
});

const openFileList = computed(() => {
  dirtyRevision.value;
  return Array.from(openFiles.values()).filter((file) => !file.closed);
});
const dirtyFiles = computed(() => {
  dirtyRevision.value;
  return Array.from(openFiles.values()).filter((file) => file.dirty);
});
const selectedChangeFiles = computed(() => {
  dirtyRevision.value;
  return dirtyFiles.value.filter((file) => selectedChangePaths.has(file.path));
});
const allChangesSelected = computed(() => dirtyFiles.value.length > 0 && dirtyFiles.value.every((file) => selectedChangePaths.has(file.path)));
const dirtyPathSet = computed(() => {
  dirtyRevision.value;
  return new Set(dirtyFiles.value.map((file) => file.path));
});
const activeFile = computed(() => {
  dirtyRevision.value;
  return openFiles.get(activePath.value);
});
const activeTextFile = computed(() => isTextFileState(activeFile.value) ? activeFile.value : null);
const activeImageFile = computed(() => activeFile.value?.fileType === "image" ? activeFile.value : null);
const activeUnsupportedFile = computed(() => activeFile.value?.fileType === "unsupported" ? activeFile.value : null);
const activeDiffFile = computed(() => {
  dirtyRevision.value;
  return activeDiffPath.value ? openFiles.get(activeDiffPath.value) : null;
});
const activeDiffUnsupportedFile = computed(() => activeDiffFile.value && !isTextFileState(activeDiffFile.value) ? activeDiffFile.value : null);
const activeLanguage = computed({ get: () => activeFile.value?.language || "plaintext", set: (value) => { if (activeFile.value) activeFile.value.language = value; } });
const previewMode = computed(() => getPreviewMode(activeTextFile.value));
const canPreviewActiveFile = computed(() => Boolean(previewMode.value));
const previewPaneVisible = computed(() => Boolean(previewVisible.value && canPreviewActiveFile.value && !activeSshTerminal.value));
const sshFeatureEnabled = computed(() => isBackendEnabled());
const sshTerminalTabs = computed(() => {
  sshRevision.value;
  return Array.from(sshSessions.values()).filter((session) => session.tabOpen);
});
const activeSshTerminal = computed(() => {
  sshRevision.value;
  return activeSshTerminalId.value ? sshSessions.get(activeSshTerminalId.value) || null : null;
});
const dialogIconClass = computed(() => ({
  alert: dialogState.tone === "danger" ? "codicon-error" : "codicon-info",
  confirm: dialogState.tone === "danger" ? "codicon-warning" : "codicon-question",
  prompt: "codicon-edit",
}[dialogState.mode] || "codicon-info"));

watch(() => settings.locale, () => { document.documentElement.lang = settings.locale; });
watch(() => settings.ai.agentModels, syncSelectedAgentModel);
watch(() => aiMessages.value.length, () => { nextTick(scrollAiMessagesToBottom); });
watch(activeSshTerminalId, () => { nextTick(attachActiveSshTerminal); });
watch(activeAiSessionId, () => { nextTick(scrollAiMessagesToBottom); });
watch(searchMatchCase, () => { if (searchSearched.value && searchQuery.value.trim()) runGlobalSearch(); });
watch(() => dirtyFiles.value.map((file) => file.path).join("\0"), pruneSelectedChangePaths);
watch(previewPaneVisible, () => { nextTick(layoutVisibleEditors); });
watch([previewPaneVisible, activePath, dirtyRevision, () => settings.locale], () => { void updatePreviewContent(); });
watch(settings, persistSettings, { deep: true });

onMounted(async () => {
  document.documentElement.lang = settings.locale;
  const pageTitle = document.title;
  const pageDescription = document.querySelector('meta[name="description"]')?.content || pageTitle;
  disableEditorPwa = enableEditorPwa({
    name: pageTitle,
    shortName: pageTitle,
    description: pageDescription,
    startUrl: `${window.location.pathname}?source=pwa`,
    icon: "/pwa-code-editor-icon.svg",
    meta: {
      "theme-color": "#0f172a",
      "mobile-web-app-capable": "yes",
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-title": pageTitle,
      "apple-mobile-web-app-status-bar-style": "black-translucent"
    }
  });
  applyChromeTheme();
  monaco = await loadMonaco();
  registerFormatters();
  editor.value = markRaw(monaco.editor.create(editorHost.value, {
    automaticLayout: true,
    fontFamily: "Consolas, 'Courier New', monospace",
    fontLigatures: true,
    lineNumbersMinChars: 4,
    roundedSelection: false,
    scrollBeyondLastLine: false,
    contextmenu: true,
    smoothScrolling: true,
    tabSize: 2,
    theme: settings.theme,
    fontSize: settings.fontSize,
    wordWrap: settings.wordWrap ? "on" : "off",
    minimap: { enabled: settings.minimap },
    inlineSuggest: { enabled: true, mode: "prefix", suppressSuggestions: false },
  }));
  diffEditor.value = markRaw(monaco.editor.createDiffEditor(diffHost.value, {
    automaticLayout: true,
    originalEditable: false,
    readOnly: false,
    renderSideBySide: true,
    theme: settings.theme,
    fontSize: settings.fontSize,
    wordWrap: settings.wordWrap ? "on" : "off",
    minimap: { enabled: settings.minimap },
  }));
  registerKeybindings();
  registerInlineCompletions();
  registerReferenceProviders();
  registerCompletionInvalidation();
  setStatus(tr("status.ready"), tr("status.loaded"));
  document.addEventListener("click", hideAllContextMenus);
  document.addEventListener("keydown", handleGlobalCommandPaletteShortcut);
  window.addEventListener("resize", hideAllContextMenus);
  window.addEventListener("resize", scheduleActiveSshTerminalFit);
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide", handlePageHide);
});

onBeforeUnmount(() => {
  disableEditorPwa?.();
  formatterDisposables.splice(0).forEach((disposable) => disposable.dispose());
  workspaceFileActionDisposables.splice(0).forEach((disposable) => disposable.dispose());
  referenceProviderDisposables.splice(0).forEach((disposable) => disposable.dispose());
  keybindingDisposables.splice(0).forEach((disposable) => disposable.dispose());
  inlineCompletionDisposables.splice(0).forEach((disposable) => disposable.dispose());
  abortAiCompletionRequest();
  aiAbortController.value?.abort();
  closeAllSshSessions({ disposeTerminal: true });
  openFiles.forEach((file) => disposeFileModels(file, { force: true }));
  disposeWorkspaceModels({ force: true });
  revokePreviewResourceUrls();
  editor.value?.dispose();
  diffEditor.value?.dispose();
  document.removeEventListener("click", hideAllContextMenus);
  document.removeEventListener("keydown", handleGlobalCommandPaletteShortcut);
  window.removeEventListener("resize", hideAllContextMenus);
  window.removeEventListener("resize", scheduleActiveSshTerminalFit);
  window.removeEventListener("beforeunload", beforeUnload);
  window.removeEventListener("pagehide", handlePageHide);
});

function tr(key, params = {}) {
  const dictionary = messages[settings.locale] || messages[defaultSettings.locale];
  let value = dictionary[key] || messages[defaultSettings.locale][key] || key;
  Object.entries(params).forEach(([name, replacement]) => { value = value.replaceAll(`{${name}}`, replacement); });
  return value;
}

function getPreviewMode(file) {
  if (!isTextFileState(file)) return "";
  if (["markdown", "mdx"].includes(file.language)) return "markdown";
  if (file.language === "html") return "html";
  return "";
}

function togglePreview() {
  if (!canPreviewActiveFile.value) return;
  if (previewVisible.value) {
    closePreview();
  } else {
    openPreview();
  }
}

function openPreview() {
  if (!canPreviewActiveFile.value) return;
  previewVisible.value = true;
  void nextTick(() => updatePreviewContent({ remountFrame: true }));
}

function closePreview() {
  previewRenderSerial += 1;
  previewVisible.value = false;
  previewContent.value = "";
  replacePreviewResourceUrls(new Map());
}

function layoutVisibleEditors() {
  editor.value?.layout();
  diffEditor.value?.layout();
}

let previewRenderSerial = 0;
let previewResourceObjectUrls = new Map();

async function updatePreviewContent({ remountFrame = false } = {}) {
  const serial = ++previewRenderSerial;
  const file = activeTextFile.value;
  if (!previewVisible.value) return;
  if (!previewPaneVisible.value || !file) return;

  const objectUrls = new Map();
  const raw = file.model.getValue();
  const rendered = previewMode.value === "markdown" ? renderMarkdown(raw) : String(raw || "");
  const resolved = await rewritePreviewResourceAttributes(rendered, file, objectUrls);
  if (serial !== previewRenderSerial) {
    revokeObjectUrlMap(objectUrls);
    return;
  }
  previewContent.value = resolved;
  if (remountFrame && previewMode.value === "html") previewFrameKey.value += 1;
  replacePreviewResourceUrls(objectUrls);
}

async function rewritePreviewResourceAttributes(html, file, objectUrls) {
  const source = String(html || "");
  const matches = Array.from(source.matchAll(/\b(src|href)\s*=\s*(["'])([^"']+)\2/gi));
  if (!matches.length) return source;
  let output = "";
  let cursor = 0;
  for (const match of matches) {
    const [fullMatch, attribute, quote, value] = match;
    const resolved = await getPreviewResourceUrl(value, file, objectUrls);
    output += source.slice(cursor, match.index);
    output += resolved === value ? fullMatch : `${attribute}=${quote}${resolved}${quote}`;
    cursor = match.index + fullMatch.length;
  }
  return output + source.slice(cursor);
}

async function getPreviewResourceUrl(value, file, objectUrls) {
  const url = String(value || "").trim();
  if (!url || url.startsWith("#") || url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(url)) return value;
  const [pathPart] = splitPreviewUrlSuffix(url);
  if (!pathPart) return value;
  let resourcePath;
  try {
    resourcePath = normalizeWorkspacePath(pathPart.startsWith("/") ? pathPart : joinWorkspacePath(getDirectoryPath(file.path), pathPart));
  } catch {
    return value;
  }
  let resource;
  try {
    resource = await ensureAnyFileState(resourcePath, { closed: true });
  } catch {
    return value;
  }
  if (isTextFileState(resource)) return getTextDataUrl(resource);
  if (resource.fileType === "image" && resource.objectUrl) return resource.objectUrl;
  if (resource.handle) return getPreviewBlobUrl(resource, objectUrls);
  return value;
}

async function getPreviewBlobUrl(file, objectUrls) {
  if (objectUrls.has(file.path)) return objectUrls.get(file.path);
  const diskFile = await file.handle.getFile();
  const objectUrl = URL.createObjectURL(diskFile);
  objectUrls.set(file.path, objectUrl);
  return objectUrl;
}

function replacePreviewResourceUrls(nextUrls) {
  const previousUrls = previewResourceObjectUrls;
  previewResourceObjectUrls = nextUrls;
  revokeObjectUrlMap(previousUrls);
}

function revokePreviewResourceUrls() {
  replacePreviewResourceUrls(new Map());
}

function revokeObjectUrlMap(urls) {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.clear();
}

function splitPreviewUrlSuffix(url) {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const indexes = [hashIndex, queryIndex].filter((index) => index >= 0);
  if (!indexes.length) return [url, ""];
  const splitIndex = Math.min(...indexes);
  return [url.slice(0, splitIndex), url.slice(splitIndex)];
}

function getTextDataUrl(file) {
  const mimeType = getPreviewMimeType(file);
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(file.model.getValue())}`;
}

function getPreviewMimeType(file) {
  const byLanguage = { css: "text/css", javascript: "text/javascript", typescript: "text/typescript", html: "text/html", markdown: "text/markdown", json: "application/json", svg: "image/svg+xml", xml: "application/xml" };
  return byLanguage[file.language] || "text/plain";
}

const dialogQueue = [];
let activeDialogResolve = null;

function showAlert(message, options = {}) {
  return showDialog({ mode: "alert", message, title: options.title || tr("dialog.alertTitle"), tone: options.tone, confirmLabel: options.confirmLabel || tr("dialog.ok") });
}

function showConfirm(message, options = {}) {
  return showDialog({ mode: "confirm", message, title: options.title || tr("dialog.confirmTitle"), tone: options.tone, confirmLabel: options.confirmLabel || tr("dialog.ok"), cancelLabel: options.cancelLabel || tr("dialog.cancel") });
}

function showPrompt(message, defaultValue = "", options = {}) {
  return showDialog({ mode: "prompt", message, value: defaultValue, title: options.title || tr("dialog.promptTitle"), placeholder: options.placeholder || "", confirmLabel: options.confirmLabel || tr("dialog.ok"), cancelLabel: options.cancelLabel || tr("dialog.cancel"), selectOnFocus: options.selectOnFocus });
}

function showDialog(options) {
  return new Promise((resolve) => {
    dialogQueue.push({ options, resolve });
    if (!dialogState.visible) openNextDialog();
  });
}

function openNextDialog() {
  const nextDialog = dialogQueue.shift();
  if (!nextDialog) return;
  activeDialogResolve = nextDialog.resolve;
  Object.assign(dialogState, {
    visible: true,
    mode: nextDialog.options.mode || "alert",
    title: nextDialog.options.title || tr("dialog.alertTitle"),
    message: nextDialog.options.message || "",
    value: nextDialog.options.value || "",
    placeholder: nextDialog.options.placeholder || "",
    confirmLabel: nextDialog.options.confirmLabel || tr("dialog.ok"),
    cancelLabel: nextDialog.options.cancelLabel || tr("dialog.cancel"),
    tone: nextDialog.options.tone || "default",
    selectOnFocus: Boolean(nextDialog.options.selectOnFocus),
  });
  nextTick(() => {
    if (dialogState.mode === "prompt") {
      dialogInput.value?.focus();
      if (dialogState.selectOnFocus) dialogInput.value?.select();
      return;
    }
    dialogPrimaryButton.value?.focus();
  });
}

function confirmDialog() {
  settleDialog(dialogState.mode === "prompt" ? dialogState.value : true);
}

function cancelDialog() {
  settleDialog(dialogState.mode === "prompt" ? null : false);
}

function settleDialog(result) {
  if (!activeDialogResolve) return;
  const resolve = activeDialogResolve;
  activeDialogResolve = null;
  dialogState.visible = false;
  resolve(result);
  nextTick(openNextDialog);
}

function loadMonaco() {
  return CdnUtils.loadMonaco();
}

function showPanel(view) {
  if (activeView.value === view && sidePanelVisible.value) {
    sidePanelVisible.value = false;
    nextTick(layoutVisibleEditors);
    return;
  }
  activeView.value = view;
  sidePanelVisible.value = true;
  nextTick(layoutVisibleEditors);
}

function createSshDraft(source = {}) {
  return {
    id: source.id || "",
    name: source.name || "",
    host: source.host || "",
    port: Number(source.port) || 22,
    username: source.username || "",
    authType: source.authType === "privateKey" ? "privateKey" : "password",
    password: source.password || "",
    privateKey: source.privateKey || "",
    passphrase: source.passphrase || "",
    exposeToAi: Boolean(source.exposeToAi),
    whitelistText: Array.isArray(source.whitelist) ? source.whitelist.join("\n") : String(source.whitelistText || ""),
  };
}

function openCreateSshDialog() {
  sshDialog.mode = "create";
  sshDialog.draft = createSshDraft({ port: 22 });
  sshDialog.visible = true;
}

function openEditSshDialog(connection) {
  sshDialog.mode = "edit";
  sshDialog.draft = createSshDraft(connection);
  sshDialog.visible = true;
}

function closeSshDialog() {
  sshDialog.visible = false;
}

function applySshWhitelistTemplateToDialog() {
  sshDialog.draft.whitelistText = String(settings.ssh.whitelistTemplate || DEFAULT_SSH_WHITELIST_TEMPLATE).trim();
}

function resetSshWhitelistTemplate() {
  settings.ssh.whitelistTemplate = DEFAULT_SSH_WHITELIST_TEMPLATE;
}

function applySshTerminalTheme() {
  sshSessions.forEach((session) => {
    session.terminal?.options && (session.terminal.options.theme = getSshTerminalTheme());
  });
}

function saveSshDialog() {
  const config = normalizeSshConfig(sshDialog.draft);
  if (!config.name || !config.host || !config.username) {
    showAlert(tr("ssh.error.required"), { tone: "danger" });
    return;
  }
  if (sshDialog.mode === "edit") {
    const index = settings.ssh.connections.findIndex((item) => item.id === config.id);
    if (index >= 0) settings.ssh.connections.splice(index, 1, config);
  } else {
    settings.ssh.connections.push({ ...config, id: createSshConfigId() });
  }
  closeSshDialog();
}

function normalizeSshConfig(value = {}) {
  const port = Math.max(1, Math.min(Number(value.port) || 22, 65535));
  return {
    id: value.id || "",
    name: String(value.name || "").trim(),
    host: String(value.host || "").trim(),
    port,
    username: String(value.username || "").trim(),
    authType: value.authType === "privateKey" ? "privateKey" : "password",
    password: value.authType === "privateKey" ? "" : String(value.password || ""),
    privateKey: value.authType === "privateKey" ? String(value.privateKey || "") : "",
    passphrase: value.authType === "privateKey" ? String(value.passphrase || "") : "",
    exposeToAi: Boolean(value.exposeToAi),
    whitelist: normalizeSshWhitelist(value.whitelistText ?? value.whitelist),
  };
}

function normalizeSshWhitelist(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return uniqueStrings(items).slice(0, 100);
}

function createSshConfigId() {
  return `ssh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function deleteSshConfig(id) {
  const config = getSshConfigById(id);
  if (!config || isSshConnected(id)) return;
  const confirmed = await showConfirm(tr("ssh.confirmDelete", { name: config.name || config.host }), { title: tr("ssh.delete"), tone: "danger" });
  if (!confirmed) return;
  settings.ssh.connections = settings.ssh.connections.filter((item) => item.id !== id);
  disposeSshTerminal(sshSessions.get(id));
  sshSessions.delete(id);
  if (activeSshTerminalId.value === id) activeSshTerminalId.value = "";
  touchSshState();
  setStatus(tr("ssh.deletedStatus", { name: config.name || config.host }), "");
}

function getSshConfigById(id) {
  return settings.ssh.connections.find((connection) => connection.id === id) || null;
}

function isSshConnected(id) {
  sshRevision.value;
  return Boolean(sshSessions.get(id)?.connected);
}

async function connectSshConfig(config) {
  if (!sshFeatureEnabled.value) {
    await showAlert(tr("ssh.error.backendDisabled"), { tone: "danger" });
    return null;
  }
  const normalized = normalizeSshConfig(config);
  const existing = sshSessions.get(normalized.id);
  if (existing?.connected) {
    existing.tabOpen = true;
    activateSshTerminal(normalized.id);
    return existing;
  }
  closeSshSession(existing, { silent: true });
  const session = createSshSession(normalized);
  sshSessions.set(normalized.id, session);
  activeSshTerminalId.value = normalized.id;
  activeDiffPath.value = "";
  touchSshState();
  setStatus(tr("ssh.connecting", { name: session.title }), `${normalized.host}:${normalized.port}`);
  nextTick(attachActiveSshTerminal);

  let socket;
  try {
    session.websocketUrl = buildSshWebSocketUrl();
    socket = new WebSocket(session.websocketUrl);
  } catch (error) {
    failSshConnection(session);
    return session;
  }
  session.ws = socket;
  session.connectTimer = window.setTimeout(() => failSshConnection(session), SSH_CONNECT_TIMEOUT_MS);
  socket.addEventListener("open", () => {
    fitSshTerminal(session);
    socket.send(JSON.stringify({ type: "connect", ...buildSshConnectPayload(normalized, session) }));
    startSshHeartbeat(session);
  });
  socket.addEventListener("message", (event) => handleSshWebSocketMessage(session, event.data));
  socket.addEventListener("close", (event) => {
    if (session.closing) {
      markSshSessionClosed(session);
      return;
    }
    if (!session.connected && !session.connectFailed) {
      failSshConnection(session);
      return;
    }
    const reason = event.reason || (event.code && event.code !== 1000 ? `WebSocket closed (${event.code})` : "");
    if (reason) appendSshOutput(session, `\n[${new Date().toLocaleTimeString(settings.locale)}] ${reason}\n`);
    markSshSessionClosed(session);
  });
  socket.addEventListener("error", () => {
    if (session.closing) return;
    failSshConnection(session);
  });
  return session;
}

function createSshSession(config) {
  return {
    configId: config.id,
    title: config.name || config.host,
    host: config.host,
    port: config.port,
    username: config.username,
    connected: false,
    connectionId: "",
    connectionInfo: null,
    output: "",
    tabOpen: true,
    ws: null,
    terminal: createXtermTerminal(),
    fitAddon: createXtermFitAddon(),
    terminalAttached: false,
    terminalDataDisposable: null,
    terminalResizeObserver: null,
    cols: 120,
    rows: 30,
    heartbeatTimer: 0,
    connectTimer: 0,
    connectFailed: false,
    closing: false,
    websocketUrl: "",
    startedAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

function createXtermTerminal() {
  const terminal = markRaw(new Terminal({
    cursorBlink: false,
    disableStdin: true,
    convertEol: true,
    fontFamily: "Consolas, 'Courier New', monospace",
    fontSize: 13,
    theme: getSshTerminalTheme(),
  }));
  return terminal;
}

function setSshTerminalInputEnabled(session, enabled) {
  if (!session?.terminal) return;
  session.terminal.options.disableStdin = !enabled;
  session.terminal.options.cursorBlink = Boolean(enabled);
  if (enabled) {
    session.terminal.focus();
  } else {
    session.terminal.blur?.();
  }
}

function createXtermFitAddon() {
  return markRaw(new FitAddon());
}

function getSshTerminalTheme() {
  return sshTerminalThemes[settings.ssh.terminalTheme] || sshTerminalThemes.dark;
}

function attachActiveSshTerminal() {
  const session = activeSshTerminal.value;
  const host = sshTerminalHost.value;
  if (!session || !host) return;
  if (!session.terminal) {
    session.terminal = createXtermTerminal();
    if (!session.terminal) return;
    session.fitAddon = createXtermFitAddon();
    touchSshState();
    nextTick(attachActiveSshTerminal);
    return;
  }
  if (!session.fitAddon) session.fitAddon = createXtermFitAddon();
  host.textContent = "";
  if (!session.terminalAttached) {
    if (session.fitAddon) session.terminal.loadAddon(session.fitAddon);
    session.terminal.open(host);
    session.terminalAttached = true;
    session.terminalDataDisposable = session.terminal.onData((data) => {
      if (session.connected && session.ws?.readyState === WebSocket.OPEN) session.ws.send(JSON.stringify({ type: "input", data }));
    });
    if (window.ResizeObserver) {
      session.terminalResizeObserver = new ResizeObserver(() => scheduleSshTerminalFit(session));
      session.terminalResizeObserver.observe(host);
    }
    if (session.output) session.terminal.write(session.output);
  } else if (session.terminal.element && session.terminal.element.parentElement !== host) {
    host.appendChild(session.terminal.element);
  }
  scheduleSshTerminalFit(session);
  session.terminal.focus();
}

function scheduleActiveSshTerminalFit() {
  const session = activeSshTerminal.value;
  if (session) scheduleSshTerminalFit(session);
}

function scheduleSshTerminalFit(session) {
  requestAnimationFrame(() => fitSshTerminal(session));
}

function fitSshTerminal(session) {
  if (!session?.terminal || !session.fitAddon || !session.terminal.element) return;
  try {
    session.fitAddon.fit();
    const cols = session.terminal.cols;
    const rows = session.terminal.rows;
    if (!cols || !rows) return;
    if (session.cols === cols && session.rows === rows) return;
    session.cols = cols;
    session.rows = rows;
    if (session.connected && session.ws?.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  } catch (error) {
    console.error("Failed to fit SSH terminal", error);
  }
}

function buildSshConnectPayload(config, session = null) {
  return {
    name: config.name,
    host: config.host,
    port: config.port,
    username: config.username,
    authType: config.authType,
    password: config.authType === "password" ? config.password : "",
    privateKey: config.authType === "privateKey" ? config.privateKey : "",
    passphrase: config.authType === "privateKey" ? config.passphrase : "",
    cols: session?.cols || 120,
    rows: session?.rows || 30,
  };
}

function buildSshWebSocketUrl() {
  const base = new URL(getBackendBaseUrl());
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = SSH_WEBSOCKET_PATH;
  base.search = "";
  const securityKey = String(settings.ssh.securityKey || "").trim();
  if (securityKey) base.searchParams.set("securityKey", securityKey);
  return base.href;
}

function handleSshWebSocketMessage(session, raw) {
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    appendSshOutput(session, String(raw || ""));
    return;
  }
  if (event.type === "connected") {
    window.clearTimeout(session.connectTimer);
    session.connectTimer = 0;
    session.connectFailed = false;
    session.closing = false;
    session.connected = true;
    setSshTerminalInputEnabled(session, true);
    session.connectionId = event.connectionId || event.connection?.id || "";
    session.connectionInfo = event.connection || null;
    session.lastActiveAt = Date.now();
    appendSshOutput(session, `[${new Date().toLocaleTimeString(settings.locale)}] ${tr("ssh.connected")}\n`);
    setStatus(tr("ssh.connectedStatus", { name: session.title }), session.connectionId);
    scheduleSshTerminalFit(session);
    return;
  }
  if (event.type === "output") {
    session.lastActiveAt = Date.now();
    appendSshOutput(session, event.data || "");
    return;
  }
  if (event.type === "closed") {
    appendSshOutput(session, `\n[${new Date().toLocaleTimeString(settings.locale)}] ${event.message || tr("ssh.disconnected")}\n`);
    markSshSessionClosed(session);
    return;
  }
  if (event.type === "error") {
    failSshConnection(session);
    return;
  }
  touchSshState();
}

function failSshConnection(session) {
  if (!session) return;
  window.clearTimeout(session.connectTimer);
  session.connectTimer = 0;
  session.connectFailed = true;
  session.closing = false;
  session.connected = false;
  setSshTerminalInputEnabled(session, false);
  window.clearInterval(session.heartbeatTimer);
  session.heartbeatTimer = 0;
  const message = tr("ssh.connectFailed");
  appendSshOutput(session, `\n[${new Date().toLocaleTimeString(settings.locale)}] ${message}\n`);
  setStatus(tr("ssh.connectFailedStatus"), session.title);
}

function appendSshOutput(session, data) {
  if (!session) return;
  const text = String(data || "");
  session.output = `${session.output || ""}${text}`.slice(-SSH_OUTPUT_MAX_CHARS);
  session.terminal?.write?.(text);
  touchSshState();
}

function startSshHeartbeat(session) {
  window.clearInterval(session.heartbeatTimer);
  session.heartbeatTimer = window.setInterval(() => {
    if (session.ws?.readyState === WebSocket.OPEN) session.ws.send(JSON.stringify({ type: "heartbeat" }));
  }, 25000);
}

function markSshSessionClosed(session) {
  if (!session) return;
  session.connected = false;
  session.closing = false;
  setSshTerminalInputEnabled(session, false);
  window.clearTimeout(session.connectTimer);
  session.connectTimer = 0;
  window.clearInterval(session.heartbeatTimer);
  session.heartbeatTimer = 0;
  setStatus(tr("ssh.closedStatus", { name: session.title }), "");
  touchSshState();
}

function disconnectSshConfig(id) {
  closeSshSession(sshSessions.get(id));
}

function closeSshSession(session, options = {}) {
  if (!session) return;
  session.closing = true;
  window.clearTimeout(session.connectTimer);
  session.connectTimer = 0;
  window.clearInterval(session.heartbeatTimer);
  session.heartbeatTimer = 0;
  if (session.ws?.readyState === WebSocket.OPEN) {
    try { session.ws.send(JSON.stringify({ type: "close" })); } catch {}
  }
  try { session.ws?.close(); } catch {}
  session.connected = false;
  setSshTerminalInputEnabled(session, false);
  if (!options.silent) appendSshOutput(session, `\n[${new Date().toLocaleTimeString(settings.locale)}] ${tr("ssh.disconnected")}\n`);
  touchSshState();
}

function closeAllSshSessions(options = {}) {
  sshSessions.forEach((session) => {
    closeSshSession(session, { silent: true });
    if (options.disposeTerminal) disposeSshTerminal(session);
  });
}

function disposeSshTerminal(session) {
  if (!session) return;
  session.terminalResizeObserver?.disconnect?.();
  session.terminalResizeObserver = null;
  session.terminalDataDisposable?.dispose?.();
  session.terminalDataDisposable = null;
  session.terminal?.dispose?.();
  session.terminal = null;
  session.fitAddon = null;
  session.terminalAttached = false;
}

function activateSshTerminal(configId) {
  const session = sshSessions.get(configId);
  if (!session) return;
  session.tabOpen = true;
  activeSshTerminalId.value = configId;
  activeDiffPath.value = "";
  diffEditor.value?.setModel(null);
  setStatus(session.title, session.connected ? tr("ssh.connected") : tr("ssh.disconnected"));
  nextTick(attachActiveSshTerminal);
}

function closeSshTerminalTab(configId) {
  const session = sshSessions.get(configId);
  if (!session) return;
  closeSshSession(session, { silent: true });
  disposeSshTerminal(session);
  session.tabOpen = false;
  sshSessions.delete(configId);
  if (activeSshTerminalId.value === configId) {
    activeSshTerminalId.value = "";
    activateLastOpenFile();
  }
  touchSshState();
}

function sendSshCommand(session, command) {
  if (!session?.connected || session.ws?.readyState !== WebSocket.OPEN) throw new Error(tr("ssh.disconnected"));
  session.ws.send(JSON.stringify({ type: "input", data: `${command}\n` }));
  session.lastActiveAt = Date.now();
  touchSshState();
}

function touchSshState() {
  sshRevision.value += 1;
}

async function openFolder() {
  if (!window.showDirectoryPicker) {
    setStatus(tr("error.unsupportedBrowser"), "");
    await showAlert(tr("error.unsupportedBrowser"));
    return;
  }
  try {
    const handle = markRaw(await window.showDirectoryPicker({ mode: "readwrite" }));
    rootHandle.value = handle;
    rootName.value = handle.name;
    openFiles.forEach((file) => disposeFileModels(file, { force: true }));
    openFiles.clear();
    disposeWorkspaceModels({ force: true });
    registerWorkspaceFileActions();
    activePath.value = "";
    activeDiffPath.value = "";
    activeSshTerminalId.value = "";
    collapsedPaths.clear();
    await refreshTree({ collapseAll: true });
    setStatus(tr("status.openedFolder", { name: handle.name }), tr("status.permissionGranted"));
  } catch (error) {
    if (error.name !== "AbortError") reportError("error.openFolder", error);
  }
}

async function refreshTree(options = {}) {
  if (!rootHandle.value) return;
  try {
    diskTree.value = await readDirectory(rootHandle.value, "");
    await refreshAgentsMdContext();
    pruneWorkspaceModels(diskTree.value);
    registerWorkspaceFileActions();
    if (options.collapseAll) {
      collapsedPaths.clear();
      collectDirectoryPaths(diskTree.value).forEach((path) => collapsedPaths.add(path));
    }
    setStatus(tr("status.refreshed", { name: rootName.value }), tr("status.itemCount", { count: countTreeNodes(diskTree.value) }));
  } catch (error) {
    reportError("error.refreshTree", error);
  }
}

function collectDirectoryPaths(nodes) {
  return nodes.flatMap((node) => node.kind === "directory" ? [node.path, ...collectDirectoryPaths(node.children || [])] : []);
}

function collectFileNodes(nodes, maxItems = Number.POSITIVE_INFINITY) {
  const files = [];
  const visit = (node) => {
    if (files.length >= maxItems) return;
    if (node.kind === "file") {
      if (!node.deleted) files.push(node);
      return;
    }
    (node.children || []).forEach(visit);
  };
  nodes.forEach(visit);
  return files;
}

function handleGlobalCommandPaletteShortcut(event) {
  if (dialogState.visible) return;
  if (event.isComposing) return;
  if (isShortcutEvent(settings.shortcuts.save, event)) {
    event.preventDefault();
    saveActiveFile();
    return;
  }
  if (isShortcutEvent(settings.shortcuts.commandPalette, event)) {
    event.preventDefault();
    openCommandPalette();
    return;
  }
  if (canPreviewActiveFile.value && isShortcutEvent(settings.shortcuts.preview, event)) {
    event.preventDefault();
    togglePreview();
    return;
  }
  if (isShortcutEvent(settings.shortcuts.search, event)) {
    event.preventDefault();
    showPanel("search");
  }
}

function isShortcutEvent(value, event) {
  const parts = String(value || "").split("+").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return false;
  const key = parts.pop();
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  const wantsCtrlCmd = modifiers.has("ctrl") || modifiers.has("cmd") || modifiers.has("meta") || modifiers.has("ctrlcmd");
  const wantsShift = modifiers.has("shift");
  const wantsAlt = modifiers.has("alt") || modifiers.has("option");
  const hasCtrlCmd = event.ctrlKey || event.metaKey;
  return hasCtrlCmd === wantsCtrlCmd
    && event.shiftKey === wantsShift
    && event.altKey === wantsAlt
    && normalizeShortcutKey(event.key) === normalizeShortcutKey(key);
}

function normalizeShortcutKey(key) {
  const value = String(key || "").trim();
  const aliases = { Esc: "Escape", Del: "Delete", Up: "ArrowUp", Down: "ArrowDown", Left: "ArrowLeft", Right: "ArrowRight", Space: " " };
  const normalized = aliases[value] || value;
  return normalized.length === 1 ? normalized.toLowerCase() : normalized.toLowerCase().replace(/^arrow/, "");
}

function openCommandPalette() {
  const targetEditor = activeDiffPath.value ? diffEditor.value?.getModifiedEditor?.() : editor.value;
  const action = targetEditor?.getAction("editor.action.quickCommand") || editor.value?.getAction("editor.action.quickCommand");
  targetEditor?.focus?.();
  action?.run();
}

async function runGlobalSearch() {
  const query = searchQuery.value.trim();
  if (!query || searchBusy.value || !rootHandle.value) return;
  const requestId = ++searchSerial;
  searchBusy.value = true;
  searchSearched.value = true;
  searchResults.value = [];
  try {
    const fileNodes = collectFileNodes(tree.value, WORKSPACE_SEARCH_FILE_LIMIT);
    const groupedResults = [];
    let totalMatches = 0;
    for (const node of fileNodes) {
      if (requestId !== searchSerial || totalMatches >= WORKSPACE_SEARCH_RESULT_LIMIT) break;
      const model = await ensureWorkspaceModelForNode(node);
      if (!model) continue;
      const remaining = WORKSPACE_SEARCH_RESULT_LIMIT - totalMatches;
      const matches = model.findMatches(query, false, false, searchMatchCase.value, null, false, remaining).map((match) => ({
        lineNumber: match.range.startLineNumber,
        column: match.range.startColumn,
        range: match.range,
        startIndex: match.range.startColumn - 1,
        endIndex: match.range.endColumn - 1,
        lineText: model.getLineContent(match.range.startLineNumber),
      }));
      if (!matches.length) continue;
      totalMatches += matches.length;
      groupedResults.push({ path: node.path, name: node.name, matches });
      searchResults.value = groupedResults.slice();
    }
    if (requestId === searchSerial) setStatus(tr("search.results", { count: totalMatches }), query);
  } finally {
    if (requestId === searchSerial) searchBusy.value = false;
  }
}

function clearSearchResults() {
  searchSerial += 1;
  searchQuery.value = "";
  searchResults.value = [];
  searchBusy.value = false;
  searchSearched.value = false;
}

function getSearchMatchSegments(match) {
  const line = match?.lineText || "";
  const start = Math.max(0, Math.min(match?.startIndex ?? 0, line.length));
  const end = Math.max(start, Math.min(match?.endIndex ?? start, line.length));
  if (start === end) return [{ text: line.trim() || line, match: false }];
  return [
    { text: line.slice(0, start), match: false },
    { text: line.slice(start, end), match: true },
    { text: line.slice(end), match: false },
  ].filter((segment) => segment.text);
}

async function replaceAllSearchResults() {
  if (searchBusy.value || !searchResults.value.length) return;
  const results = searchResults.value.map((result) => ({ ...result, matches: result.matches.slice() }));
  const replacement = searchReplaceText.value;
  let replacedCount = 0;
  for (const result of results) {
    const file = await ensureFileState(result.path, { closed: true });
    if (!file || file.deleted) continue;
    const edits = result.matches
      .slice()
      .sort((a, b) => b.range.startLineNumber - a.range.startLineNumber || b.range.startColumn - a.range.startColumn)
      .map((match) => ({ range: match.range, text: replacement }));
    if (!edits.length) continue;
    file.model.pushEditOperations([], edits, () => null);
    updateDirtyState(file);
    replacedCount += edits.length;
  }
  setStatus(tr("search.replaced", { count: replacedCount }), searchQuery.value.trim());
  await runGlobalSearch();
}

async function openSearchResult(result, match) {
  const file = await openFileByPath(result.path);
  if (!file || !match?.range) return;
  await nextTick();
  editor.value?.setSelection(match.range);
  editor.value?.revealRangeInCenter(match.range);
  editor.value?.focus();
}

function registerWorkspaceFileActions() {
  workspaceFileActionDisposables.splice(0).forEach((disposable) => disposable.dispose());
  if (!editor.value) return;
  const targetEditors = [editor.value, diffEditor.value?.getOriginalEditor(), diffEditor.value?.getModifiedEditor()].filter(Boolean);
  const fileNodes = collectFileNodes(tree.value, WORKSPACE_FILE_ACTION_LIMIT);
  fileNodes.forEach((node, nodeIndex) => {
    targetEditors.forEach((targetEditor, editorIndex) => {
      workspaceFileActionDisposables.push(targetEditor.addAction({
        id: `browser-editor-open-file-${editorIndex}-${nodeIndex}-${hashWorkspacePath(node.path)}`,
        label: `Open File: ${node.path}`,
        run: () => openFileByPath(node.path),
      }));
    });
  });
}

function hashWorkspacePath(path) {
  let hash = 0;
  for (let index = 0; index < path.length; index += 1) hash = ((hash << 5) - hash + path.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(36);
}

async function openFileByPath(path) {
  const normalized = normalizeWorkspacePath(path);
  const existing = openFiles.get(normalized);
  if (existing) {
    existing.closed = false;
    activateFile(existing.path);
    return existing;
  }
  const node = findNodeByPath(tree.value, normalized);
  if (node?.kind === "file") return openFile(node);
  return null;
}

function getWorkspaceModelUri(path) {
  return monaco.Uri.parse(`file:///${encodeURI(path)}`);
}

function getOriginalModelUri(path) {
  return monaco.Uri.parse(`inmemory://original/${encodeURIComponent(path)}`);
}

function getPreviewModelUri(path) {
  return monaco.Uri.parse(`inmemory://preview/${encodeURIComponent(path)}`);
}

function getWorkspacePathFromModel(model) {
  if (model?.uri?.scheme !== "file") return "";
  return decodeURI(model.uri.path.replace(/^\/+/, ""));
}

function getOrCreateWorkspaceModel(content, monacoLanguage, path, syncContent = false) {
  const uri = getWorkspaceModelUri(path);
  const existing = monaco.editor.getModel(uri);
  if (existing) {
    if (existing.getLanguageId() !== monacoLanguage) monaco.editor.setModelLanguage(existing, monacoLanguage);
    if (syncContent && existing.getValue() !== content) existing.setValue(content);
    return markRaw(existing);
  }
  return markRaw(monaco.editor.createModel(content, monacoLanguage, uri));
}

function createOriginalModel(content, monacoLanguage, path) {
  return markRaw(monaco.editor.createModel(content, monacoLanguage, getOriginalModelUri(path)));
}

function getOrCreatePreviewModel(content, path) {
  const uri = getPreviewModelUri(path);
  const existing = monaco.editor.getModel(uri);
  if (existing) {
    if (existing.getValue() !== content) existing.setValue(content);
    return markRaw(existing);
  }
  return markRaw(monaco.editor.createModel(content, "plaintext", uri));
}

async function ensureWorkspaceModelForNode(node, token) {
  if (token?.isCancellationRequested || !node || node.kind !== "file") return null;
  const openFileState = openFiles.get(node.path);
  if (openFileState && !openFileState.deleted) return isTextFileState(openFileState) ? openFileState.model : null;
  if (FileUtils.isImageFileName(node.name)) return null;
  if (!node.handle) return null;
  const existing = monaco.editor.getModel(getWorkspaceModelUri(node.path));
  if (existing) {
    workspaceModelPaths.add(node.path);
    return existing;
  }
  if (workspaceModelPromises.has(node.path)) return workspaceModelPromises.get(node.path);
  const promise = (async () => {
    const file = await node.handle.getFile();
    if (token?.isCancellationRequested || !isReadableTextFile(file)) return null;
    const content = await file.text();
    const monacoLanguage = getMonacoLanguageId(getLanguageId(node.name));
    const model = getOrCreateWorkspaceModel(content, monacoLanguage, node.path, true);
    workspaceModelPaths.add(node.path);
    return model;
  })().catch(() => null).finally(() => workspaceModelPromises.delete(node.path));
  workspaceModelPromises.set(node.path, promise);
  return promise;
}

function pruneWorkspaceModels(nodes) {
  const existingPaths = new Set(collectFileNodes(nodes, Number.POSITIVE_INFINITY).map((node) => node.path));
  Array.from(workspaceModelPaths).forEach((path) => {
    if (existingPaths.has(path) || openFiles.has(path)) return;
    monaco.editor.getModel(getWorkspaceModelUri(path))?.dispose();
    workspaceModelPaths.delete(path);
    workspaceModelPromises.delete(path);
  });
}

function disposeWorkspaceModels({ force = false } = {}) {
  Array.from(workspaceModelPaths).forEach((path) => {
    if (!force && openFiles.has(path)) return;
    monaco.editor.getModel(getWorkspaceModelUri(path))?.dispose();
    workspaceModelPaths.delete(path);
    workspaceModelPromises.delete(path);
  });
}

function mergePendingFilesIntoTree(nodes, pendingFiles) {
  const cloned = nodes.map((node) => ({ ...node, children: node.children ? mergePendingFilesIntoTree(node.children, []) : [] }));
  pendingFiles.forEach((file) => upsertPendingFileNode(cloned, file));
  sortTreeNodes(cloned);
  return cloned;
}

function upsertPendingFileNode(nodes, file) {
  const parts = file.path.split("/");
  const name = parts.pop();
  let current = nodes;
  let basePath = "";
  for (const part of parts) {
    const path = basePath ? `${basePath}/${part}` : part;
    let directory = current.find((node) => node.path === path && node.kind === "directory");
    if (!directory) {
      directory = { name: part, path, parentPath: basePath, kind: "directory", handle: null, children: [], pending: true };
      current.push(directory);
    }
    current = directory.children;
    basePath = path;
  }
  const existing = current.find((node) => node.path === file.path);
  const pendingNode = { name, path: file.path, parentPath: parts.join("/"), kind: "file", handle: file.handle, children: [], pending: true, deleted: file.deleted };
  if (existing) Object.assign(existing, pendingNode);
  else current.push(pendingNode);
}

function sortTreeNodes(nodes) {
  nodes.sort((a, b) => a.kind !== b.kind ? (a.kind === "directory" ? -1 : 1) : a.name.localeCompare(b.name, settings.locale, { sensitivity: "base" }));
  nodes.forEach((node) => { if (node.children?.length) sortTreeNodes(node.children); });
}

async function readDirectory(directoryHandle, basePath) {
  const nodes = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    if (shouldHideName(name)) continue;
    const path = basePath ? `${basePath}/${name}` : name;
    const node = { name, path, parentPath: basePath, kind: handle.kind, handle: markRaw(handle), children: [] };
    if (handle.kind === "directory") node.children = await readDirectory(handle, path);
    nodes.push(node);
  }
  sortTreeNodes(nodes);
  return nodes;
}

async function openFile(node) {
  try {
    if (openFiles.has(node.path)) {
      openFiles.get(node.path).closed = false;
      touchDirtyState();
      activateFile(node.path);
      return openFiles.get(node.path);
    }
    const file = await node.handle.getFile();
    if (FileUtils.isImageFile(file)) return openImageFile(node, file);
    if (!isReadableTextFile(file)) return openUnsupportedFile(node, file);
    const content = await file.text();
    const language = getLanguageId(node.name);
    const monacoLanguage = getMonacoLanguageId(language);
    const model = getOrCreateWorkspaceModel(content, monacoLanguage, node.path, true);
    workspaceModelPaths.delete(node.path);
    const originalModel = createOriginalModel(content, monacoLanguage, node.path);
    const fileState = { name: node.name, path: node.path, handle: markRaw(node.handle), fileType: "text", model, originalModel, savedValue: content, dirty: false, closed: false, language, monacoLanguage };
    fileState.modelContentDisposable = model.onDidChangeContent(() => {
      updateDirtyState(fileState);
    });
    openFiles.set(node.path, fileState);
    activateFile(node.path);
    setStatus(tr("status.openedFile", { name: node.name }), getLanguageLabel(language));
    return fileState;
  } catch (error) {
    reportError("error.openFile", error);
    return null;
  }
}

function openImageFile(node, file) {
  const fileState = createImageFileState(node, file, { closed: false });
  activateFile(node.path);
  setStatus(tr("status.openedFile", { name: node.name }), `${tr("imagePreview.type")} | ${FileUtils.formatFileSize(file.size)}`);
  return fileState;
}

function createImageFileState(node, file, options = {}) {
  const objectUrl = URL.createObjectURL(file);
  const fileState = { name: node.name, path: node.path, handle: markRaw(node.handle), fileType: "image", objectUrl, size: file.size, mimeType: file.type, dirty: false, closed: options.closed ?? true, language: "plaintext", monacoLanguage: "plaintext", isNew: false, deleted: false };
  fileState.model = getOrCreatePreviewModel(getReadonlyPreviewContent(fileState), node.path);
  openFiles.set(node.path, fileState);
  touchDirtyState();
  return fileState;
}

function openUnsupportedFile(node, file) {
  const fileState = createUnsupportedFileState(node, file, { closed: false });
  activateFile(node.path);
  setStatus(tr("status.openedFile", { name: node.name }), `${tr("unsupportedFile.type")} | ${FileUtils.formatFileSize(file.size)}`);
  return fileState;
}

function createUnsupportedFileState(node, file, options = {}) {
  const fileState = { name: node.name, path: node.path, handle: markRaw(node.handle), fileType: "unsupported", size: file.size, mimeType: file.type, dirty: false, closed: options.closed ?? true, language: "plaintext", monacoLanguage: "plaintext", isNew: false, deleted: false };
  fileState.model = getOrCreatePreviewModel(getReadonlyPreviewContent(fileState), node.path);
  openFiles.set(node.path, fileState);
  touchDirtyState();
  return fileState;
}

function getReadonlyPreviewContent(file) {
  const title = file.fileType === "image" ? tr("imagePreview.type") : tr("unsupportedFile.title");
  return [
    title,
    "",
    file.fileType === "image" ? tr("imagePreview.aria") : tr("unsupportedFile.description"),
    "",
    `Path: ${file.path}`,
    `Size: ${FileUtils.formatFileSize(file.size)}`,
    file.mimeType ? `MIME: ${file.mimeType}` : "",
    file.deleted ? `Status: ${tr("changes.deleted")}` : "",
  ].filter(Boolean).join("\n");
}

function refreshReadonlyPreviewModel(file) {
  if (!file?.model || file.fileType === "text") return;
  const content = getReadonlyPreviewContent(file);
  if (file.model.getValue() !== content) file.model.setValue(content);
}

function activateFile(path) {
  const file = openFiles.get(path);
  if (!file) return;
  activeSshTerminalId.value = "";
  if (file.deleted) {
    activateDiff(path);
    return;
  }
  file.closed = false;
  openFiles.set(path, file);
  touchDirtyState();
  activeDiffPath.value = "";
  diffEditor.value?.setModel(null);
  activePath.value = path;
  if (file.fileType === "image") {
    activateReadonlyPreviewEditor(file);
    setStatus(path, `${tr("imagePreview.type")} | ${FileUtils.formatFileSize(file.size)}`);
    return;
  }
  if (file.fileType === "unsupported") {
    activateReadonlyPreviewEditor(file);
    setStatus(path, `${tr("unsupportedFile.type")} | ${FileUtils.formatFileSize(file.size)}`);
    return;
  }
  editor.value.updateOptions({ readOnly: false });
  editor.value.setModel(file.model);
  editor.value.focus();
  setStatus(path, `${getLanguageLabel(file.language)} | ${file.dirty ? tr("status.unsaved") : tr("status.saved")}`);
}

function activateReadonlyPreviewEditor(file) {
  refreshReadonlyPreviewModel(file);
  editor.value.updateOptions({ readOnly: true });
  editor.value.setModel(file.model);
  nextTick(() => editor.value?.focus());
}

function focusActivePreviewEditor() {
  if (activeFile.value?.model || activeDiffUnsupportedFile.value?.model) editor.value?.focus();
}

function activateDiff(path) {
  const file = openFiles.get(path);
  if (!file) return;
  activeSshTerminalId.value = "";
  activePath.value = path;
  activeDiffPath.value = path;
  if (!isTextFileState(file)) {
    diffEditor.value?.setModel(null);
    activateReadonlyPreviewEditor(file);
    setStatus(tr("status.diff", { path }), file.deleted ? tr("changes.deleted") : tr("status.unsaved"));
    return;
  }
  diffEditor.value.setModel({ original: file.originalModel, modified: file.model });
  nextTick(() => diffEditor.value?.layout());
  setStatus(tr("status.diff", { path }), file.deleted ? tr("changes.deleted") : `${getLanguageLabel(file.language)} | ${file.dirty ? tr("status.unsaved") : tr("status.saved")}`);
}

function closeFile(path) {
  const file = openFiles.get(path);
  if (!file) return;
  if (file.dirty) {
    file.closed = true;
    openFiles.set(path, file);
    touchDirtyState();
  } else {
    disposeFileModels(file);
    openFiles.delete(path);
  }
  if (activePath.value === path) {
    activateLastOpenFile(path);
  }
}

function activateLastOpenFile(excludedPath = "") {
  const nextPath = Array.from(openFiles.values()).filter((file) => !file.closed && file.path !== excludedPath).map((file) => file.path).at(-1) || "";
  activeSshTerminalId.value = "";
  activePath.value = "";
  activeDiffPath.value = "";
  diffEditor.value?.setModel(null);
  if (nextPath) {
    activateFile(nextPath);
  } else {
    editor.value.updateOptions({ readOnly: false });
    editor.value.setModel(null);
  }
}

function removeFileState(path) {
  const file = openFiles.get(path);
  if (!file) return;
  disposeFileModels(file, { force: true });
  openFiles.delete(path);
  removeAiTouchedPath(path);
  selectedChangePaths.delete(path);
  if (activePath.value === path) activateLastOpenFile(path);
}

async function saveActiveFile() {
  const file = activeFile.value;
  if (!file) return;
  try {
    await saveFile(file);
  } catch (error) {
    reportError("error.saveFile", error);
  }
}

async function saveFile(file, options = {}) {
  const refresh = options.refresh ?? true;
  const updateStatus = options.status ?? true;
  if (file.deleted) {
    const path = file.path;
    await removeFileFromDisk(path);
    removeFileState(path);
    touchDirtyState();
    if (refresh) await refreshTree();
    if (updateStatus) setStatus(tr("status.deleted", { path }), new Date().toLocaleTimeString(settings.locale));
    return true;
  }
  if (!isTextFileState(file)) {
    if (updateStatus) setStatus(tr("error.unsupportedFile"), file.path);
    return false;
  }
  if (!file.handle) file.handle = markRaw(await getFileHandleForPath(file.path, true));
  const writable = await file.handle.createWritable();
  await writable.write(file.model.getValue());
  await writable.close();
  file.savedValue = file.model.getValue();
  file.originalModel?.setValue(file.savedValue);
  file.isNew = false;
  file.dirty = false;
  if (refresh) await refreshTree();
  if (file.closed) {
    removeFileState(file.path);
  } else {
    openFiles.set(file.path, file);
  }
  selectedChangePaths.delete(file.path);
  touchDirtyState();
  if (updateStatus) setStatus(tr("status.savedFile", { name: file.name }), new Date().toLocaleTimeString(settings.locale));
  return true;
}

function changeActiveLanguage() {
  if (!activeTextFile.value) return;
  activeFile.value.monacoLanguage = getMonacoLanguageId(activeFile.value.language);
  monaco.editor.setModelLanguage(activeFile.value.model, activeFile.value.monacoLanguage);
  if (activeFile.value.originalModel) monaco.editor.setModelLanguage(activeFile.value.originalModel, activeFile.value.monacoLanguage);
  setStatus(activeFile.value.path, `${getLanguageLabel(activeFile.value.language)} | ${activeFile.value.dirty ? tr("status.unsaved") : tr("status.saved")}`);
}

function updateDirtyState(file) {
  file.dirty = Boolean(file.isNew || file.deleted) || (isTextFileState(file) && file.model.getValue() !== file.savedValue);
  openFiles.set(file.path, file);
  touchDirtyState();
}

function touchDirtyState() {
  dirtyRevision.value += 1;
}

function toggleChangeSelection(path, selected) {
  selected ? selectedChangePaths.add(path) : selectedChangePaths.delete(path);
}

function toggleAllChangesSelection(selected) {
  selectedChangePaths.clear();
  if (selected) dirtyFiles.value.forEach((file) => selectedChangePaths.add(file.path));
}

function pruneSelectedChangePaths() {
  const dirtyPaths = new Set(dirtyFiles.value.map((file) => file.path));
  Array.from(selectedChangePaths).forEach((path) => {
    if (!dirtyPaths.has(path)) selectedChangePaths.delete(path);
  });
}

async function saveSelectedChanges() {
  const files = selectedChangeFiles.value.slice();
  if (!files.length) return;
  let savedCount = 0;
  try {
    for (const file of files) {
      const saved = await saveFile(file, { refresh: false, status: false });
      if (saved) {
        savedCount += 1;
        selectedChangePaths.delete(file.path);
      }
    }
    await refreshTree();
    touchDirtyState();
    setStatus(tr("changes.batchSaved", { count: savedCount }), new Date().toLocaleTimeString(settings.locale));
  } catch (error) {
    reportError("error.saveFile", error);
  }
}

async function revertSelectedChanges() {
  const files = selectedChangeFiles.value.slice();
  if (!files.length) return;
  const confirmed = await showConfirm(tr("confirm.revertSelected", { count: files.length }), { title: tr("action.revert"), tone: "danger" });
  if (!confirmed) return;
  let revertedCount = 0;
  for (const file of files) {
    await revertFile(file.path, { confirm: false, status: false });
    selectedChangePaths.delete(file.path);
    revertedCount += 1;
  }
  setStatus(tr("changes.batchReverted", { count: revertedCount }), new Date().toLocaleTimeString(settings.locale));
}

function toggleDirectory(path) {
  collapsedPaths.has(path) ? collapsedPaths.delete(path) : collapsedPaths.add(path);
}

function showContextMenu(event, node) {
  if (!rootHandle.value) return;
  contextMenu.node = node;
  contextMenu.visible = true;
  nextTick(() => {
    const width = 190;
    const height = 220;
    contextMenu.x = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8));
    contextMenu.y = Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8));
  });
}

function hideContextMenu() {
  contextMenu.visible = false;
}

function hideAllContextMenus() {
  hideContextMenu();
  hideChangesContextMenu();
}

async function runContextAction(action) {
  const node = contextMenu.node;
  hideContextMenu();
  if (action === "new-file") await createFileFromContext(node);
  if (action === "new-folder") await createFolderFromContext(node);
  if (action === "new-file-pending") await createPendingFileFromContext(node);
  if (action === "delete") await deleteNode(node);
  if (action === "delete-pending") await markNodeDeleted(node);
  if (action === "refresh") await refreshTree();
}

function getContextDirectoryPath(node) {
  if (!node) return "";
  return node.kind === "directory" ? node.path : node.parentPath;
}

function joinWorkspacePath(basePath, name) {
  return normalizeWorkspacePath(basePath ? `${basePath}/${name}` : name);
}

function getDirectoryPath(path) {
  const normalized = normalizeWorkspacePath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

async function createFileFromContext(node) {
  const name = await showPrompt(tr("prompt.newFile"));
  if (!name) return;
  try {
    const path = joinWorkspacePath(getContextDirectoryPath(node), name);
    if (findNodeByPath(diskTree.value, path) || openFiles.has(path)) throw new Error(`File already exists: ${path}`);
    await createFileOnDisk(path);
    await refreshTree();
    const createdNode = findNodeByPath(diskTree.value, path);
    if (createdNode) await openFile(createdNode);
  } catch (error) {
    reportError("error.createFile", error);
  }
}

async function createPendingFileFromContext(node) {
  const name = await showPrompt(tr("prompt.newFile"));
  if (!name) return;
  try {
    const path = joinWorkspacePath(getContextDirectoryPath(node), name);
    if (findNodeByPath(tree.value, path) || openFiles.has(path)) throw new Error(`File already exists: ${path}`);
    const file = createVirtualFileState(path, { closed: false });
    activateFile(file.path);
    setStatus(tr("status.pendingCreate", { path: file.path }), tr("status.unsaved"));
  } catch (error) {
    reportError("error.createFile", error);
  }
}

async function createFolderFromContext(node) {
  const name = await showPrompt(tr("prompt.newFolder"));
  if (!name) return;
  try {
    const path = joinWorkspacePath(getContextDirectoryPath(node), name);
    await getDirectoryByParts(path.split("/"), true);
    await refreshTree();
    setStatus(tr("status.refreshed", { name: rootName.value }), path);
  } catch (error) {
    reportError("error.createFolder", error);
  }
}

async function markNodeDeleted(node) {
  if (!node || node.kind !== "file") return;
  const file = openFiles.get(node.path);
  if (file?.isNew && !file.handle) {
    removeFileState(node.path);
    setStatus(tr("status.deleted", { path: node.path }), tr("status.unsaved"));
    return;
  }
  await markFileDeleted(node.path, { closed: true });
}

function showChangesContextMenu(event, file) {
  changesContextMenu.file = file;
  changesContextMenu.visible = true;
  nextTick(() => {
    const width = 190;
    const height = 96;
    changesContextMenu.x = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8));
    changesContextMenu.y = Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8));
  });
}

function hideChangesContextMenu() {
  changesContextMenu.visible = false;
}

async function runChangesContextAction(action) {
  const file = changesContextMenu.file;
  hideChangesContextMenu();
  if (!file) return;
  if (action === "open-diff") activateDiff(file.path);
  if (action === "revert") await revertFile(file.path);
}

async function revertFile(path, options = {}) {
  const file = openFiles.get(path);
  if (!file || !file.dirty) return;
  if (options.confirm !== false && !await showConfirm(tr("confirm.revert", { path }), { title: tr("action.revert"), tone: "danger" })) return;
  if (file.isNew) {
    removeFileState(path);
    if (options.status !== false) setStatus(tr("status.reverted", { path }), "");
    return;
  }
  file.deleted = false;
  if (isTextFileState(file)) {
    file.model.setValue(file.savedValue);
    file.originalModel?.setValue(file.savedValue);
  } else {
    refreshReadonlyPreviewModel(file);
  }
  file.dirty = false;
  if (file.closed) {
    removeFileState(path);
  } else {
    openFiles.set(path, file);
  }
  touchDirtyState();
  if (!file.closed && activeDiffPath.value === path) activateFile(path);
  selectedChangePaths.delete(path);
  if (options.status !== false) setStatus(tr("status.reverted", { path }), getLanguageLabel(file.language));
}

async function deleteNode(node) {
  if (!node || !rootHandle.value) return;
  const pendingFile = openFiles.get(node.path);
  if (node.kind === "file" && pendingFile?.isNew && !pendingFile.handle) {
    removeFileState(node.path);
    setStatus(tr("status.deleted", { path: node.path }), tr("status.unsaved"));
    return;
  }
  const dirtyFiles = getOpenFilesUnderPath(node.path).filter((file) => file.dirty);
  const confirmed = await showConfirm(tr("confirm.delete", {
    path: node.path,
    folderHint: node.kind === "directory" ? tr("confirm.deleteFolderHint") : "",
    dirtyHint: dirtyFiles.length ? tr("confirm.deleteDirtyHint", { count: dirtyFiles.length }) : "",
  }), { title: tr("action.delete"), tone: "danger" });
  if (!confirmed) return;
  try {
    const parentDirectory = await getDirectoryByParts(node.parentPath ? node.parentPath.split("/") : [], false);
    await parentDirectory.removeEntry(node.name, { recursive: node.kind === "directory" });
    closeOpenFilesUnderPath(node.path);
    collapsedPaths.delete(node.path);
    await refreshTree();
    setStatus(tr("status.deleted", { path: node.path }), "");
  } catch (error) {
    reportError("error.delete", error);
  }
}

function applyTheme() {
  monaco.editor.setTheme(settings.theme);
  diffEditor.value?.updateOptions({ theme: settings.theme });
  applyChromeTheme();
}

function applyChromeTheme() {
  document.body.classList.remove("theme-vs", "theme-vs-dark", "theme-hc-black");
}

function applyLocale() {
  document.documentElement.lang = settings.locale;
  setStatus(status.left, status.right);
}

function applyEditorOptions() {
  editor.value?.updateOptions({ fontSize: settings.fontSize, wordWrap: settings.wordWrap ? "on" : "off", minimap: { enabled: settings.minimap } });
  diffEditor.value?.updateOptions({ fontSize: settings.fontSize, wordWrap: settings.wordWrap ? "on" : "off", minimap: { enabled: settings.minimap } });
}

function resetKeybindings() {
  settings.shortcuts = { ...vscodeShortcuts };
  updateKeybindings();
}

function updateKeybindings() {
  registerKeybindings();
  setStatus(tr("status.shortcutUpdated"), Object.values(settings.shortcuts).join(" · "));
}

function registerKeybindings() {
  keybindingDisposables.splice(0).forEach((disposable) => disposable.dispose());
  const targetEditors = [editor.value, diffEditor.value?.getOriginalEditor(), diffEditor.value?.getModifiedEditor()].filter(Boolean);
  const actions = [
    { id: "browser-editor-save", label: tr("action.save"), shortcut: settings.shortcuts.save, run: saveActiveFile },
    { id: "browser-editor-format", label: tr("action.format"), shortcut: settings.shortcuts.format, run: formatActiveFile },
    { id: "browser-editor-command-palette", label: tr("commandCenter.title"), shortcut: settings.shortcuts.commandPalette, run: openCommandPalette },
    { id: "browser-editor-search", label: tr("panel.search"), shortcut: settings.shortcuts.search, run: () => showPanel("search") },
    { id: "browser-editor-find-references", label: tr("action.findReferences"), shortcut: settings.shortcuts.findReferences, run: triggerFindReferences },
    { id: "browser-editor-preview", label: tr("action.preview"), shortcut: settings.shortcuts.preview, run: togglePreview },
    { id: "browser-editor-toggle-sidebar", label: tr("action.toggleSidebar"), shortcut: settings.shortcuts.toggleSidebar, run: toggleSidePanel },
    { id: "browser-editor-ai-complete", label: tr("action.aiComplete"), shortcut: settings.shortcuts.aiComplete, run: triggerAiCompletion },
  ];
  actions.forEach((action, index) => {
    const keybinding = parseShortcut(action.shortcut);
    if (!keybinding) {
      setStatus(tr("status.shortcutInvalid", { shortcut: action.shortcut }), action.label);
      return;
    }
    targetEditors.forEach((targetEditor, editorIndex) => {
      keybindingDisposables.push(targetEditor.addAction({
        id: `${action.id}-${index}-${editorIndex}-${Date.now()}`,
        label: action.label,
        keybindings: [keybinding],
        run: action.run,
      }));
    });
  });
}

function parseShortcut(value) {
  const parts = String(value || "").split("+").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  let code = 0;
  const key = parts.pop();
  parts.forEach((part) => {
    const mod = part.toLowerCase();
    if (mod === "ctrl" || mod === "cmd" || mod === "meta" || mod === "ctrlcmd") code |= monaco.KeyMod.CtrlCmd;
    if (mod === "shift") code |= monaco.KeyMod.Shift;
    if (mod === "alt" || mod === "option") code |= monaco.KeyMod.Alt;
  });
  const keyCode = getMonacoKeyCode(key);
  return keyCode ? code | keyCode : null;
}

function getMonacoKeyCode(key) {
  const normalized = key.trim();
  if (/^[a-z]$/i.test(normalized)) return monaco.KeyCode[`Key${normalized.toUpperCase()}`];
  if (/^[0-9]$/.test(normalized)) return monaco.KeyCode[`Digit${normalized}`];
  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(normalized)) return monaco.KeyCode[normalized.toUpperCase()];
  const aliases = { Enter: "Enter", Esc: "Escape", Escape: "Escape", Space: "Space", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Del: "Delete", Up: "UpArrow", Down: "DownArrow", Left: "LeftArrow", Right: "RightArrow" };
  return monaco.KeyCode[aliases[normalized] || normalized];
}

function parseCommaList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function syncSelectedAgentModel() {
  const models = parseCommaList(settings.ai.agentModels);
  if (models.length && !models.includes(settings.ai.agentModel)) settings.ai.agentModel = models[0];
}

function normalizeAgentModelsInput() {
  const models = uniqueStrings(parseCommaList(settings.ai.agentModels));
  if (!models.length) return;
  settings.ai.agentModels = models.join(",");
  syncSelectedAgentModel();
}

function addAgentModelFromSelect() {
  if (!agentModelToAdd.value) return;
  const models = uniqueStrings([...parseCommaList(settings.ai.agentModels), agentModelToAdd.value]);
  settings.ai.agentModels = models.join(",");
  if (!settings.ai.agentModel || !models.includes(settings.ai.agentModel)) settings.ai.agentModel = agentModelToAdd.value;
  agentModelToAdd.value = "";
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function getCurrentBackendBaseUrl() {
  return window.location.origin && window.location.origin !== "null" ? window.location.origin : "";
}

function normalizeBackendBaseUrlValue(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeBackendBaseUrl() {
  settings.backend.baseUrl = normalizeBackendBaseUrlValue(settings.backend.baseUrl) || defaultBackendSettings.baseUrl;
}

function isBackendEnabled() {
  return Boolean(settings.backend?.enabled);
}

function isWorkspaceLoaded() {
  return Boolean(rootHandle.value);
}

function validateBackendEnabled() {
  if (!isBackendEnabled()) throw new Error(tr("ai.error.backendDisabled"));
}

function getAiExposedSshConfigs() {
  return (settings.ssh?.connections || []).filter((connection) => connection.exposeToAi);
}

function isSshAiAvailable() {
  return isBackendEnabled() && getAiExposedSshConfigs().length > 0;
}

function getBackendBaseUrl() {
  const baseUrl = normalizeBackendBaseUrlValue(settings.backend?.baseUrl) || defaultBackendSettings.baseUrl;
  try {
    return new URL(baseUrl).href.replace(/\/+$/, "");
  } catch {
    throw new Error(tr("ai.error.invalidBackendBaseUrl"));
  }
}

function validateAiConfig(model) {
  if (!settings.ai.apiKey.trim() || !model) throw new Error(tr("ai.error.missingConfig"));
}

function validateAiApiKey() {
  if (!settings.ai.apiKey.trim()) throw new Error(tr("ai.error.missingApiKey"));
}

function getAiBaseUrl() {
  const baseUrl = (settings.ai.baseUrl.trim() || defaultAiSettings.baseUrl).replace(/\/+$/, "");
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

async function callOpenAiResponses(payload, signal) {
  const startedAt = performance.now();
  const response = await fetch(`${getAiBaseUrl()}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.ai.apiKey.trim()}` },
    body: JSON.stringify(payload),
    signal,
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : {};
  Object.defineProperty(data, "__meta", { value: { ms: Math.round(performance.now() - startedAt), bytes: raw.length }, enumerable: false });
  if (!response.ok) throw new Error(data.error?.message || data.message || response.statusText);
  return data;
}

async function fetchAiModels() {
  if (aiModelsLoading.value) return;
  try {
    validateAiApiKey();
    aiModelsLoading.value = true;
    const response = await fetch(`${getAiBaseUrl()}/models`, {
      headers: { Authorization: `Bearer ${settings.ai.apiKey.trim()}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || data.message || response.statusText);
    const models = uniqueStrings((data.data || []).map((model) => model.id || model.name || model.model));
    aiAvailableModels.value = models;
    if (models.length) {
      if (!settings.ai.completionModel.trim()) settings.ai.completionModel = models[0];
      if (!settings.ai.agentModel.trim()) settings.ai.agentModel = models[0];
      if (!parseCommaList(settings.ai.agentModels).length) settings.ai.agentModels = models[0];
    }
    setStatus(tr("status.aiModelsLoaded", { count: models.length }), getAiBaseUrl());
  } catch (error) {
    setStatus("AI Models", error.message || String(error));
    showAlert(`${tr("settings.aiFetchModels")}: ${error.message || error}`, { tone: "danger" });
  } finally {
    aiModelsLoading.value = false;
  }
}

function extractResponseText(response) {
  if (typeof response.output_text === "string") return response.output_text.trim();
  const parts = [];
  for (const item of response.output || []) {
    if (item.type === "message") {
      for (const content of item.content || []) {
        if (typeof content.text === "string") parts.push(content.text);
        if (typeof content.output_text === "string") parts.push(content.output_text);
      }
    }
  }
  return parts.join("\n").trim();
}

function extractFunctionCalls(response) {
  return (response.output || []).filter((item) => item.type === "function_call" && item.name);
}

function createAiSession() {
  aiSessionSerial += 1;
  return { id: `ai-session-${Date.now()}-${aiSessionSerial}`, title: tr("ai.defaultSessionTitle", { count: aiSessionSerial }), prompt: "", messages: [], touchedPaths: new Set() };
}

function getActiveAiSession() {
  if (activeAiSession.value) return activeAiSession.value;
  const session = createAiSession();
  aiSessions.push(session);
  activeAiSessionId.value = session.id;
  return session;
}

function createAiSessionAndActivate() {
  const session = createAiSession();
  aiSessions.push(session);
  activeAiSessionId.value = session.id;
  setStatus(tr("ai.sessionCreated"), session.title);
}

async function deleteActiveAiSession() {
  if (aiBusy.value || aiSessions.length <= 1) return;
  const index = aiSessions.findIndex((session) => session.id === activeAiSessionId.value);
  if (index === -1) return;
  const confirmed = await showConfirm(tr("confirm.deleteAiSession"), { title: tr("ai.deleteSession"), tone: "danger" });
  if (!confirmed) return;
  aiSessions.splice(index, 1);
  activeAiSessionId.value = aiSessions[Math.min(index, aiSessions.length - 1)].id;
  refreshAiTouchedFlags();
  touchDirtyState();
  setStatus(tr("ai.sessionDeleted"), "");
}

function addAiMessage(role, content, meta = {}, session = getActiveAiSession()) {
  session.messages.push(createAiMessage(role, content, meta));
}

function createAiMessage(role, content, meta = {}) {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, content, ...meta };
}

function getActiveAiTouchedPaths(session = getActiveAiSession()) {
  return session.touchedPaths;
}

function markAiTouchedFile(file, session = getActiveAiSession()) {
  getActiveAiTouchedPaths(session).add(file.path);
  file.aiTouched = true;
}

function refreshAiTouchedFlags() {
  const touchedPaths = new Set();
  aiSessions.forEach((session) => session.touchedPaths.forEach((path) => touchedPaths.add(path)));
  openFiles.forEach((file) => { file.aiTouched = touchedPaths.has(file.path); });
}

function removeAiTouchedPath(path) {
  aiSessions.forEach((session) => session.touchedPaths.delete(path));
  refreshAiTouchedFlags();
}

function scrollAiMessagesToBottom() {
  const element = aiMessagesEl.value;
  if (element) element.scrollTop = element.scrollHeight;
}

function handleAiPromptKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  event.preventDefault();
  sendAiPrompt();
}

function formatJsonForDisplay(value) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function registerInlineCompletions() {
  inlineCompletionDisposables.splice(0).forEach((disposable) => disposable.dispose());
  const languages = getEditorFeatureLanguageIds();
  languages.forEach((language) => {
    inlineCompletionDisposables.push(monaco.languages.registerInlineCompletionsProvider(language, {
      async provideInlineCompletions(model, position, context, token) {
        if (!settings.ai.apiKey.trim() || !settings.ai.completionModel.trim()) return { items: [] };
        const file = getFileByModel(model);
        if (!file) return { items: [] };
        const manual = Date.now() < aiCompletionManualUntil;
        if (!manual) return { items: [] };
        const snapshot = getAiCompletionSnapshot(model, position);
        const requestId = ++aiCompletionRequestSerial;
        if (token?.isCancellationRequested || requestId !== aiCompletionRequestSerial || !isAiCompletionSnapshotCurrent(snapshot)) return { items: [] };
        if (aiCompletionInFlight) return { items: [] };
        const controller = new AbortController();
        aiCompletionAbortController = controller;
        aiCompletionInFlight = true;
        try {
          const insertText = await requestAiCompletion(file, model, position, controller.signal);
          if (token?.isCancellationRequested || requestId !== aiCompletionRequestSerial || !isAiCompletionSnapshotCurrent(snapshot) || !insertText.trim()) return { items: [] };
          return { items: [{ insertText, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }] };
        } catch (error) {
          if (error.name !== "AbortError") console.warn("AI completion failed", error);
          return { items: [] };
        } finally {
          if (aiCompletionAbortController === controller) {
            aiCompletionAbortController = null;
            aiCompletionInFlight = false;
          }
        }
      },
      disposeInlineCompletions() {},
      freeInlineCompletions() {},
    }));
  });
}

function registerReferenceProviders() {
  referenceProviderDisposables.splice(0).forEach((disposable) => disposable.dispose());
  const languages = getEditorFeatureLanguageIds();
  languages.forEach((language) => {
    referenceProviderDisposables.push(monaco.languages.registerReferenceProvider(language, {
      provideReferences(model, position, context, token) {
        return provideWorkspaceReferences(model, position, token);
      },
    }));
  });
}

function getEditorFeatureLanguageIds() {
  const monacoLanguages = monaco?.languages?.getLanguages?.().map((language) => language.id) || [];
  return Array.from(new Set(["plaintext", ...languageOptions.map((item) => item.id), ...monacoLanguages]));
}

async function provideWorkspaceReferences(model, position, token) {
  const word = model.getWordAtPosition(position);
  if (!word?.word) return [];
  const fileNodes = collectFileNodes(tree.value, WORKSPACE_REFERENCE_FILE_LIMIT);
  for (const node of fileNodes) {
    if (token?.isCancellationRequested) return [];
    await ensureWorkspaceModelForNode(node, token);
  }
  const references = [];
  const workspaceModels = new Map();
  monaco.editor.getModels().forEach((workspaceModel) => {
    const path = getWorkspacePathFromModel(workspaceModel);
    if (path) workspaceModels.set(path, workspaceModel);
  });
  for (const workspaceModel of workspaceModels.values()) {
    if (token?.isCancellationRequested || references.length >= WORKSPACE_REFERENCE_RESULT_LIMIT) break;
    const matches = workspaceModel.findMatches(word.word, false, false, true, null, false, WORKSPACE_REFERENCE_RESULT_LIMIT - references.length);
    matches.forEach((match) => {
      if (isExactWordMatch(workspaceModel, match.range, word.word)) references.push({ uri: workspaceModel.uri, range: match.range });
    });
  }
  return references;
}

function isExactWordMatch(model, range, word) {
  const matchWord = model.getWordAtPosition({ lineNumber: range.startLineNumber, column: range.startColumn });
  return matchWord?.word === word && matchWord.startColumn === range.startColumn && matchWord.endColumn === range.endColumn;
}

function registerCompletionInvalidation() {
  inlineCompletionDisposables.push(editor.value.onDidChangeModelContent(invalidateAiCompletionRequest));
  inlineCompletionDisposables.push(editor.value.onDidChangeCursorPosition(invalidateAiCompletionRequest));
}

function invalidateAiCompletionRequest() {
  aiCompletionRequestSerial += 1;
  aiCompletionManualUntil = 0;
  abortAiCompletionRequest();
}

function abortAiCompletionRequest() {
  if (!aiCompletionAbortController) return;
  aiCompletionRequestSerial += 1;
  aiCompletionAbortController.abort();
  aiCompletionAbortController = null;
  aiCompletionInFlight = false;
}

function getAiCompletionSnapshot(model, position) {
  return { model, versionId: model.getVersionId(), lineNumber: position.lineNumber, column: position.column };
}

function isAiCompletionSnapshotCurrent(snapshot) {
  const position = editor.value?.getPosition();
  return editor.value?.getModel() === snapshot.model
    && snapshot.model.getVersionId() === snapshot.versionId
    && position?.lineNumber === snapshot.lineNumber
    && position?.column === snapshot.column;
}

async function requestAiCompletion(file, model, position, signal) {
  validateAiConfig(settings.ai.completionModel.trim());
  const value = model.getValue();
  const offset = model.getOffsetAt(position);
  const prefixChars = AI_COMPLETION_MANUAL_PREFIX_CHARS;
  const suffixChars = AI_COMPLETION_MANUAL_SUFFIX_CHARS;
  const prefix = value.slice(Math.max(0, offset - prefixChars), offset);
  const suffix = value.slice(offset, Math.min(value.length, offset + suffixChars));
  const response = await callOpenAiResponses({
    model: settings.ai.completionModel.trim(),
    store: false,
    reasoning: { effort: "low" },
    text: { verbosity: "low" },
    instructions: "You are a code completion engine. Return only the missing text to insert at <CURSOR>. Do not repeat existing code before or after the cursor. Do not output the whole function/class/block when only a part is missing. No markdown.",
    input: `File: ${file.path}\nLanguage: ${file.language}\n\n${prefix}<CURSOR>${suffix}`,
    max_output_tokens: AI_COMPLETION_MANUAL_MAX_OUTPUT_TOKENS,
  }, signal);
  const text = extractResponseText(response).replace(/^```[\w-]*\n?/, "").replace(/```$/, "");
  const meta = response.__meta;
  if (meta) setStatus("AI Completion", `${meta.ms}ms · ${(meta.bytes / 1024).toFixed(1)}KB`);
  return text;
}

async function sendAiPrompt() {
  const session = getActiveAiSession();
  const prompt = aiPrompt.value.trim();
  if (!prompt || aiBusy.value) return;
  try {
    validateAiConfig(settings.ai.agentModel.trim());
  } catch (error) {
    addAiMessage("assistant", error.message, {}, session);
    return;
  }
  aiPrompt.value = "";
  aiBusy.value = true;
  addAiMessage("user", prompt, {}, session);
  const controller = new AbortController();
  aiAbortController.value = controller;
  try {
    await runAiAgent(prompt, controller.signal, session);
    setStatus(tr("status.aiCompleted"), settings.ai.agentModel.trim());
  } catch (error) {
    if (error.name === "AbortError") {
      addAiMessage("assistant", tr("status.aiStopped"), {}, session);
      setStatus(tr("status.aiStopped"), "");
    } else {
      addAiMessage("assistant", error.message || String(error), {}, session);
      setStatus("AI Error", error.message || String(error));
    }
  } finally {
    aiBusy.value = false;
    if (aiAbortController.value === controller) aiAbortController.value = null;
  }
}

function stopAiTask() {
  aiAbortController.value?.abort();
}

function resetAiConversation() {
  if (aiBusy.value || !canResetAiConversation.value) return;
  const session = getActiveAiSession();
  aiPrompt.value = "";
  session.messages.splice(0, session.messages.length);
  session.touchedPaths.clear();
  session.title = tr("ai.defaultSessionTitle", { count: aiSessions.indexOf(session) + 1 });
  refreshAiTouchedFlags();
  touchDirtyState();
  setStatus(tr("ai.conversationReset"), "");
}

async function compressAiContext() {
  if (aiBusy.value || !aiMessages.value.length) return;
  try {
    validateAiConfig(settings.ai.agentModel.trim());
  } catch (error) {
    addAiMessage("assistant", error.message);
    return;
  }
  const controller = new AbortController();
  aiAbortController.value = controller;
  aiBusy.value = true;
  const beforeLength = aiContextLength.value;
  try {
    const response = await callOpenAiResponses({
      model: settings.ai.agentModel.trim(),
      store: false,
      instructions: "Compress the provided AI assistant conversation into a concise but complete context summary for future coding-agent turns. Preserve user goals, decisions, file paths, tool results, pending unsaved changes, AI-created files, deleted/pending-delete files, and unresolved issues. Do not add markdown fences.",
      input: `Workspace: ${rootName.value || "unknown"}\nAI-touched files: ${formatFileStateList(getAiTouchedFiles())}\nDirty files: ${formatFileStateList(dirtyFiles.value)}\n\nConversation to compress:\n${formatRecentAiMessages({ includePendingUserMessage: true })}`,
      max_output_tokens: 4096,
    }, controller.signal);
    updateAiContextUsage(response);
    const summary = extractResponseText(response);
    if (!summary) throw new Error("Empty compressed context");
    aiMessages.value.splice(0, aiMessages.value.length, createAiMessage("assistant", `# ${tr("ai.contextSummaryTitle")}\n\n${summary}`));
    await nextTick();
    setStatus(tr("ai.contextCompressed"), `${beforeLength} -> ${aiContextLength.value}`);
  } catch (error) {
    if (error.name === "AbortError") {
      setStatus(tr("status.aiStopped"), "");
    } else {
      addAiMessage("assistant", error.message || String(error));
      setStatus("AI Error", error.message || String(error));
    }
  } finally {
    aiBusy.value = false;
    if (aiAbortController.value === controller) aiAbortController.value = null;
  }
}

async function runAiAgent(prompt, signal, session = getActiveAiSession()) {
  const conversation = buildAgentInputMessages(prompt, session);
  const agentInstructions = getAgentInstructions();
  for (let round = 0; round < AI_AGENT_MAX_TOOL_CALL_ROUNDS; round += 1) {
    const payload = { model: settings.ai.agentModel.trim(), instructions: agentInstructions, input: conversation, tools: getAiToolDefinitions() };
    if (settings.ai.reasoningEffort && settings.ai.reasoningEffort !== "default") payload.reasoning = { effort: settings.ai.reasoningEffort };
    const response = await callOpenAiResponses(payload, signal);
    updateAiContextUsage(response);
    const text = extractResponseText(response);
    if (text) addAiMessage("assistant", text, {}, session);
    const toolCalls = extractFunctionCalls(response);
    if (!toolCalls.length) return;
    conversation.push(...(response.output || []));
    const imageInputs = [];
    for (const call of toolCalls) {
      const args = parseAiToolArguments(call);
      if (call.name === "read_image") {
        const result = await runAiReadImageToolCall(args, imageInputs);
        addAiMessage("tool", result.summary || "", { expanded: false, tool: { name: call.name, ok: result.ok, args, result } }, session);
        conversation.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
        continue;
      }
      const result = await runAiToolCall(call, args, session);
      addAiMessage("tool", result.summary || "", { expanded: false, tool: { name: call.name, ok: result.ok, args, result } }, session);
      conversation.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
    if (imageInputs.length) conversation.push(buildImageInputMessage(imageInputs));
  }
  addAiMessage("assistant", "Reached the tool-call round limit. Review the current changes before continuing.", {}, session);
}

async function runAiReadImageToolCall(args, imageInputs) {
  try {
    const image = await aiToolReadImage(args.path);
    imageInputs.push(image);
    return {
      ok: true,
      summary: `Attached image ${image.path} to the next model turn`,
      path: image.path,
      mime_type: image.mimeType,
      size: image.size,
    };
  } catch (error) {
    return { ok: false, summary: error.message || String(error) };
  }
}

function buildImageInputMessage(images) {
  const content = [];
  images.forEach((image) => {
    content.push({ type: "input_text", text: `Image attached from read_image: ${image.path}` });
    content.push({ type: "input_image", image_url: image.dataUrl, detail: "auto" });
  });
  return { role: "user", content };
}

function getAgentInstructions() {
  const instructions = [
    "You are an autonomous coding assistant inside a browser-based Monaco editor.",
    "You run in a browser sandbox, not on the user's local machine. Do not claim you can directly run local shell commands, terminal commands, filesystem commands, package managers, git, or host tools unless an explicit tool listed below is available and you actually use it.",
    "Use list_tools when you need to check which tools are currently available. Use get_tool_details when you need parameter details for specific tools.",
    "Treat the Workspace context message as the current condition summary. Use list_tools for current tool availability and do not use unavailable tools.",
    "Never claim a file changed unless a tool reports success.",
    `You have at most ${AI_AGENT_MAX_TOOL_CALL_ROUNDS} tool-call rounds per user request; batch related reads and edits, avoid retry loops, and finish with the best available result before exhausting the limit.`,
    "When multiple independent tool calls are needed and their arguments are already known, issue them in the same response instead of one tool call per round. Only serialize tool calls when a later call depends on an earlier result.",
    "Use run_javascript for deterministic calculations, parsing, or data transformations. It runs in an isolated browser Web Worker with no DOM, editor, or workspace file access; pass needed data as input.",
    "When workspace file tools are available, use tools to inspect and edit the workspace.",
    "All edit tools modify only in-memory editor models. The user must save files manually; new files created by write_file and files marked by delete_file are not written to disk until saved by the user.",
    "Resolve references like 'the file you created' from Recent chat and AI-touched files before using the current editor file. If multiple files match, ask a short clarification instead of editing or deleting the current file by default.",
    "When reading several files or applying several edits, prefer the batch tools read_files and replace_in_files over multiple single-file tool calls.",
    "Use refresh_tree when you need to rescan the workspace file tree before locating files.",
    "Prefer replace_in_file with exact old_text and minimal new_text for local edits, similar to patch hunks.",
    "Use write_file only for new files, tiny files, generated files, or when no stable exact local replacement is possible.",
    "Use read_image when the user asks you to inspect an image file; the tool attaches the image to the next model turn as visual input.",
    "Prefer small, targeted edits. Explain changed files briefly after tool work is complete; do not paste whole modified files in chat.",
    "When request_proxy is available, use it for external HTTP resources that may be blocked by browser CORS.",
    "When SSH tools are available, they are only for SSH settings explicitly exposed to AI. When using execute_ssh_command, provide a clear reason, a commands array containing only every main command used by the shell command, and a high_risk boolean based on your risk assessment. List every SSH command you ran in your final answer. Main commands outside each setting's whitelist require user approval; high_risk=true requires approval even if whitelisted.",
  ];
  const agentsMd = getRootAgentsMdContent();
  if (agentsMd) instructions.push(formatAgentsMdInstructions(agentsMd));
  return instructions.join(" ");
}

async function refreshAgentsMdContext() {
  agentsMdContent.value = await readRootAgentsMdFromDisk();
}

function getRootAgentsMdContent() {
  dirtyRevision.value;
  const opened = openFiles.get(AI_AGENTS_FILE_NAME);
  if (isTextFileState(opened)) return opened.model.getValue();
  return agentsMdContent.value;
}

async function readRootAgentsMdFromDisk() {
  if (!rootHandle.value) return "";
  try {
    const handle = await rootHandle.value.getFileHandle(AI_AGENTS_FILE_NAME);
    const file = await handle.getFile();
    if (!isReadableTextFile(file)) return "";
    return await file.text();
  } catch (error) {
    if (error?.name === "NotFoundError") return "";
    console.warn(`Failed to load ${AI_AGENTS_FILE_NAME}:`, error);
    return "";
  }
}

function formatAgentsMdInstructions(content) {
  const text = String(content || "").trim();
  if (!text) return "";
  const truncated = text.length > AI_AGENTS_MAX_CHARS;
  return [
    `Additional workspace instructions from root ${AI_AGENTS_FILE_NAME}:`,
    truncated ? text.slice(0, AI_AGENTS_MAX_CHARS) : text,
    truncated ? `[${AI_AGENTS_FILE_NAME} truncated to ${AI_AGENTS_MAX_CHARS} characters]` : "",
  ].filter(Boolean).join("\n");
}

function buildAgentInputMessages(prompt, session = getActiveAiSession()) {
  return [
    { role: "user", content: buildAgentWorkspaceContext() },
    ...buildAgentRecentChatMessages(session),
    { role: "user", content: buildAgentTouchedFilesContext(session) },
    { role: "user", content: buildAgentRequestContext(prompt, session) },
  ];
}

function buildAgentWorkspaceContext() {
  const workspaceLoaded = isWorkspaceLoaded();
  const backendEnabled = isBackendEnabled();
  const sshConnections = getAiExposedSshConfigs();
  return [
    "Workspace context:",
    `Workspace: ${rootName.value || "unknown"}`,
    `Workspace loaded: ${workspaceLoaded ? "yes" : "no"}`,
    `Backend enabled: ${backendEnabled ? "yes" : "no"}`,
    `SSH exposed count: ${sshConnections.length}`,
    `${AI_AGENTS_FILE_NAME}: ${getRootAgentsMdContent() ? "loaded" : "not loaded"}`,
    `Locale: ${settings.locale}`,
  ].join("\n");
}

function buildAgentRecentChatMessages(session = getActiveAiSession()) {
  const messages = getRecentAiHistoryMessages({ session });
  if (!messages.length) return [{ role: "user", content: "Recent chat:\nnone" }];
  return [
    { role: "user", content: "Recent chat messages follow as separate input messages." },
    ...messages.map((message, index) => ({ role: message.role === "assistant" ? "assistant" : "user", content: `Recent chat ${index + 1} (${message.role}):\n${String(message.content || "")}` })),
  ];
}

function buildAgentTouchedFilesContext(session = getActiveAiSession()) {
  const touchedPaths = getActiveAiTouchedPaths(session);
  return [
    "AI-touched files:",
    formatFileStateList(getAiTouchedFiles(session), { touchedPaths }),
  ].join("\n");
}

function buildAgentRequestContext(prompt, session = getActiveAiSession()) {
  const current = activeFile.value ? `${activeFile.value.path} (${activeFile.value.language})` : "none";
  const touchedPaths = getActiveAiTouchedPaths(session);
  return [
    "Current request context:",
    `Current file: ${current}`,
    `Open files: ${openFileList.value.map((file) => file.path).join(", ") || "none"}`,
    `Dirty files: ${formatFileStateList(dirtyFiles.value, { touchedPaths })}`,
    `User request:\n${prompt}`,
  ].join("\n");
}

function getAiTouchedFiles(session = getActiveAiSession()) {
  dirtyRevision.value;
  const touchedPaths = getActiveAiTouchedPaths(session);
  return Array.from(openFiles.values()).filter((file) => touchedPaths.has(file.path));
}

function formatFileStateList(files, options = {}) {
  if (!files.length) return "none";
  const touchedPaths = options.touchedPaths || getActiveAiTouchedPaths();
  return files.map((file) => {
    const flags = [file.isNew ? "new" : "", file.deleted ? "pending-delete" : "", file.dirty ? "dirty" : "", touchedPaths.has(file.path) ? "ai-touched" : ""].filter(Boolean).join(",");
    return flags ? `${file.path} [${flags}]` : file.path;
  }).join(", ");
}

function formatRecentAiMessages(options = {}) {
  const history = getRecentAiHistoryMessages(options);
  if (!history.length) return "none";
  return history.map((message) => `${message.role}: ${String(message.content || "")}`).join("\n---\n");
}

function getRecentAiHistoryMessages(options = {}) {
  const messages = options.session?.messages || aiMessages.value;
  return options.includePendingUserMessage ? messages : messages.slice(0, -1);
}

function updateAiContextUsage(response) {
  const usage = normalizeAiUsage(response?.usage);
  if (usage) aiContextUsage.value = usage;
}

function normalizeAiUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
  const output = Number(usage.output_tokens ?? usage.completion_tokens ?? 0);
  const total = Number(usage.total_tokens ?? input + output);
  const rawCached = usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? usage.cached_tokens;
  const cached = Number(rawCached ?? 0);
  if (![input, output, total].some((value) => Number.isFinite(value) && value > 0)) return null;
  return {
    input: Number.isFinite(input) ? input : 0,
    output: Number.isFinite(output) ? output : 0,
    total: Number.isFinite(total) ? total : 0,
    cached: Number.isFinite(cached) ? cached : 0,
    hasCache: rawCached != null,
  };
}

function formatAiUsage(usage) {
  if (!usage) return tr("ai.usageNotMeasured");
  const cacheRate = usage.input > 0 && usage.cached > 0 ? Math.round((usage.cached / usage.input) * 100) : 0;
  const cache = cacheRate ? tr("ai.usageCache", { cached: usage.cached, rate: cacheRate }) : (usage.hasCache ? tr("ai.usageCacheMiss") : "");
  return tr("ai.usageMeasured", {
    input: usage.input,
    output: usage.output,
    total: usage.total,
    cache,
  });
}

function getAiToolDefinitions() {
  return getAiAllToolDefinitions()
    .filter((tool) => getAiToolAvailability(tool).available)
    .map(stripAiToolInternalMetadata);
}

function getAiBaseToolDefinitions() {
  return [
    { type: "function", name: "list_tools", description: "List AI tool names, short descriptions, and current availability. Set only_available to true to omit unavailable tools. Does not include parameter schemas; use get_tool_details for that.", parameters: { type: "object", properties: { only_available: { type: "boolean", description: "When true, return only tools that are currently available. Defaults to false." } } } },
    { type: "function", name: "get_tool_details", description: "Get parameter schemas and parameter descriptions for specific AI tools by name. Use after list_tools when you need exact arguments.", parameters: { type: "object", properties: { names: { type: "array", items: { type: "string" }, description: "Tool names to describe." } }, required: ["names"] } },
    { type: "function", name: "run_javascript", description: "Execute a JavaScript snippet in an isolated browser Web Worker for calculations, parsing, or transforming provided input data. The code is the body of an async function with an input variable available; use return to produce a result. No DOM/editor/workspace access.", parameters: { type: "object", properties: { code: { type: "string", description: "JavaScript async function body. Example: return input.items.map(x => x * 2);" }, input: { type: "object", description: "Optional JSON object exposed to the script as input. Wrap arrays or primitive values in an object property." }, timeout_ms: { type: "number", description: "Optional timeout in milliseconds. Defaults to 2000, max 5000." } }, required: ["code"] } },
  ];
}

function getAiRequestProxyToolDefinition() {
  return { type: "function", name: "request_proxy", requirements: ["backend"], description: "Fetch an external HTTP/HTTPS URL through the configured backend request proxy to avoid browser CORS limits. Returns status, headers and truncated text response.", parameters: { type: "object", properties: { url: { type: "string", description: "Absolute target URL, including query string if needed." }, method: { type: "string", description: "HTTP method. Defaults to GET." }, headers: { type: "object", additionalProperties: { type: "string" }, description: "Optional request headers forwarded to the target." }, body: { type: "string", description: "Optional request body. Not allowed for GET or HEAD." }, follow_redirect: { type: "boolean", description: "Whether the backend proxy should follow redirects. Defaults to true." }, enable_cors: { type: "boolean", description: "Whether the proxy response should include permissive CORS headers. Defaults to true." }, max_chars: { type: "number", description: "Maximum response body characters to return. Defaults to 20000." } }, required: ["url"] } };
}

function getAiAllToolDefinitions() {
  return [...getAiBaseToolDefinitions(), ...getAiFileToolDefinitions(), getAiRequestProxyToolDefinition(), ...getAiSshToolDefinitions()];
}

function getAiFileToolDefinitions() {
  return addAiToolRequirements([
    { type: "function", name: "list_files", description: "List workspace files and directories. By default only lists the first level; set recursive to true to include descendants.", parameters: { type: "object", properties: { path: { type: "string", description: "Optional directory path relative to workspace root." }, max_items: { type: "number", description: "Maximum items to return." }, recursive: { type: "boolean", description: "Whether to recursively list descendants. Defaults to false." } } } },
    { type: "function", name: "refresh_tree", description: "Refresh the workspace file tree from disk. Use this before locating newly created, deleted, or externally changed files.", parameters: { type: "object", properties: { collapse_all: { type: "boolean", description: "Whether to collapse all directories after refreshing. Defaults to false." } } } },
    { type: "function", name: "read_file", description: "Read a text file. Dirty in-memory content is returned when present. Use offset and limit for partial line-based reads.", parameters: { type: "object", properties: { path: { type: "string" }, offset: { type: "number", description: "Optional 1-based starting line number. Defaults to 1." }, limit: { type: "number", description: "Optional maximum number of lines to return." } }, required: ["path"] } },
    { type: "function", name: "read_files", description: "Read multiple text files in one call. Dirty in-memory content is returned when present. Use offset and limit for partial line-based reads applied to each file.", parameters: { type: "object", properties: { paths: { type: "array", items: { type: "string" } }, offset: { type: "number", description: "Optional 1-based starting line number applied to each file. Defaults to 1." }, limit: { type: "number", description: "Optional maximum number of lines to return per file." }, max_chars_per_file: { type: "number" } }, required: ["paths"] } },
    { type: "function", name: "read_image", description: "Read an image file and attach it to the next model turn for visual analysis. Use this for screenshots, diagrams, mockups, and other workspace image files.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { type: "function", name: "search_text", description: "Search text across workspace files.", parameters: { type: "object", properties: { query: { type: "string" }, path: { type: "string" }, max_results: { type: "number" } }, required: ["query"] } },
    { type: "function", name: "get_current_file", description: "Get current editor file, cursor and selected text.", parameters: { type: "object", properties: {} } },
    { type: "function", name: "replace_in_file", description: "Replace the first exact text occurrence in a file in memory. Use this for minimal local edits; do not pass whole-file old_text/new_text unless the file is tiny and no smaller exact edit is possible.", parameters: { type: "object", properties: { path: { type: "string" }, old_text: { type: "string" }, new_text: { type: "string" } }, required: ["path", "old_text", "new_text"] } },
    { type: "function", name: "replace_in_files", description: "Apply multiple exact local replacements in one call. Prefer this after batch-reading files and planning several patch hunks. Returns per-edit results; individual edit failures do not abort the whole batch.", parameters: { type: "object", properties: { edits: { type: "array", items: { type: "object", properties: { path: { type: "string" }, old_text: { type: "string" }, new_text: { type: "string" } }, required: ["path", "old_text", "new_text"] } } }, required: ["edits"] } },
    { type: "function", name: "write_file", description: "Create or replace a whole file in memory. Use only for new files, tiny files, generated files, or when exact local replacement is not stable. Does not save to disk.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
    { type: "function", name: "delete_file", description: "Mark a file for deletion in memory. Existing disk files are deleted only when the user saves the deletion; unsaved new files are removed immediately from memory.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { type: "function", name: "open_file", description: "Open a file in the editor.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { type: "function", name: "show_diff", description: "Show diff for an in-memory changed file.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }
  ], ["workspace"]);
}

function getAiSshToolDefinitions() {
  return addAiToolRequirements([
    { type: "function", name: "get_ssh_connections", description: "Get SSH settings exposed to AI, including name, host, port, active state, and command whitelist. Secrets are never returned.", parameters: { type: "object", properties: {} } },
    { type: "function", name: "open_ssh_connection", description: "Open an exposed SSH connection by id, name, or host. The backend SSH WebSocket performs the actual SSH connection.", parameters: { type: "object", properties: { connection: { type: "string", description: "SSH setting id, name, or host." } }, required: ["connection"] } },
    { type: "function", name: "activate_ssh_terminal", description: "Switch the visible editor tab to an already active exposed SSH terminal by id, name, or host. Does not execute any SSH command.", parameters: { type: "object", properties: { connection: { type: "string", description: "SSH setting id, name, or host." } }, required: ["connection"] } },
    { type: "function", name: "close_ssh_connection", description: "Close an active exposed SSH connection by id, name, or host.", parameters: { type: "object", properties: { connection: { type: "string", description: "SSH setting id, name, or host." } }, required: ["connection"] } },
    { type: "function", name: "read_ssh_output", description: "Read recent output from an active exposed SSH connection.", parameters: { type: "object", properties: { connection: { type: "string", description: "SSH setting id, name, or host." }, max_chars: { type: "number", description: "Maximum output characters. Defaults to 20000." } }, required: ["connection"] } },
    { type: "function", name: "execute_ssh_command", description: "Execute a command on an active exposed SSH connection. The AI must provide a reason, commands array containing only every main command used by the shell command, and high_risk based on its own risk assessment. Main commands outside the whitelist require approval; high_risk=true always requires approval.", parameters: { type: "object", properties: { connection: { type: "string", description: "SSH setting id, name, or host." }, command: { type: "string" }, commands: { type: "array", items: { type: "string" }, description: "Required list of main commands used by command, excluding arguments. Include every command in chains, pipes, and substitutions. Example: for 'ls -la && whoami', pass ['ls','whoami']." }, high_risk: { type: "boolean", description: "Required. AI-assessed risk flag. Set true if the command may modify files/system state, affect services, expose secrets, consume significant resources, or otherwise be risky." }, reason: { type: "string", description: "Required explanation of why this SSH command is needed." } }, required: ["connection", "command", "commands", "high_risk", "reason"] } },
  ], ["backend", "ssh_exposed"]);
}

function addAiToolRequirements(tools, requirements) {
  return tools.map((tool) => ({ ...tool, requirements }));
}

function aiToolListTools({ only_available: onlyAvailable = false } = {}) {
  const tools = getAiAllToolDefinitions()
    .map(formatAiToolListItem)
    .filter((tool) => !onlyAvailable || tool.available);
  return {
    summary: `${tools.length} tool(s) returned`,
    tools,
  };
}

function aiToolGetToolDetails({ names } = {}) {
  const definitions = new Map(getAiAllToolDefinitions().map((tool) => [tool.name, tool]));
  const requestedNames = uniqueStrings(Array.isArray(names) ? names.map((name) => String(name || "").trim()).filter(Boolean) : []);
  const tools = requestedNames.map((name) => {
    const tool = definitions.get(name);
    if (!tool) return { name, found: false };
    const availability = getAiToolAvailability(tool);
    return {
      name: tool.name,
      found: true,
      available: availability.available,
      unavailable_reason: availability.reason || "",
      description: formatAiToolDescriptionWithCondition(tool),
      parameters: tool.parameters || {},
    };
  });
  return { summary: `${tools.length} tool detail(s) returned`, tools };
}

function formatAiToolListItem(tool) {
  const availability = getAiToolAvailability(tool);
  return {
    name: tool.name,
    description: formatAiToolDescriptionWithCondition(tool),
    available: availability.available,
  };
}

function getAiToolAvailability(name) {
  const tool = typeof name === "string" ? getAiToolDefinitionByName(name) : name;
  if (!tool) return { found: false, available: false, reason: "Unknown tool" };
  const unmet = (tool.requirements || []).map(getAiRequirementStatus).filter((requirement) => !requirement.met);
  return { found: true, available: unmet.length === 0, reason: unmet.map((requirement) => requirement.reason).join("; ") };
}

function formatAiToolDescriptionWithCondition(tool = {}) {
  const condition = getAiToolConditionDescription(tool);
  return condition ? `${tool.description || ""} Condition: ${condition}` : (tool.description || "");
}

function getAiToolConditionDescription(tool) {
  if (typeof tool === "string") tool = getAiToolDefinitionByName(tool);
  return (tool?.requirements || []).map(getAiRequirementStatus).map((requirement) => requirement.description).join("; ");
}

function getAiToolDefinitionByName(name) {
  return getAiAllToolDefinitions().find((tool) => tool.name === name) || null;
}

function getAiRequirementStatus(requirement) {
  switch (requirement) {
    case "workspace": return { met: isWorkspaceLoaded(), description: "requires an open workspace folder", reason: "No workspace folder is open" };
    case "backend": return { met: isBackendEnabled(), description: "requires backend server enabled", reason: "Backend server setting is disabled" };
    case "ssh_exposed": return { met: getAiExposedSshConfigs().length > 0, description: "requires at least one SSH setting exposed to AI", reason: "No SSH setting is exposed to AI" };
    default: return { met: false, description: `requires ${requirement}`, reason: `Unknown requirement: ${requirement}` };
  }
}

function stripAiToolInternalMetadata(tool) {
  const { requirements, ...definition } = tool;
  return definition;
}

function parseAiToolArguments(call) {
  return call.arguments ? JSON.parse(call.arguments) : {};
}

async function runAiToolCall(call, args = {}, session = getActiveAiSession()) {
  try {
    const availability = getAiToolAvailability(call.name);
    if (availability.found && !availability.available) return { ok: false, summary: `Tool ${call.name} is unavailable because ${availability.reason}` };
    switch (call.name) {
      case "list_tools": return okTool(aiToolListTools(args));
      case "get_tool_details": return okTool(aiToolGetToolDetails(args));
      case "list_files": return okTool(await aiToolListFiles(args));
      case "refresh_tree": return okTool(await aiToolRefreshTree(args));
      case "read_file": return okTool(await aiToolReadFile(args));
      case "read_files": return okTool(await aiToolReadFiles(args));
      case "search_text": return okTool(await aiToolSearchText(args));
      case "run_javascript": return await aiToolRunJavaScript(args);
      case "request_proxy": return okTool(await aiToolRequestProxy(args));
      case "get_ssh_connections": return okTool(aiToolGetSshConnections());
      case "open_ssh_connection": return okTool(await aiToolOpenSshConnection(args.connection));
      case "activate_ssh_terminal": return okTool(aiToolActivateSshTerminal(args.connection));
      case "close_ssh_connection": return okTool(aiToolCloseSshConnection(args.connection));
      case "read_ssh_output": return okTool(aiToolReadSshOutput(args));
      case "execute_ssh_command": return okTool(await aiToolExecuteSshCommand(args));
      case "get_current_file": return okTool(aiToolGetCurrentFile());
      case "replace_in_file": return okTool(await aiToolReplaceInFile(args, session));
      case "replace_in_files": return okTool(await aiToolReplaceInFiles(args, session));
      case "write_file": return okTool(await aiToolWriteFile(args, session));
      case "delete_file": return okTool(await aiToolDeleteFile(args.path, session));
      case "open_file": return okTool(await aiToolOpenFile(args.path));
      case "show_diff": return okTool(await aiToolShowDiff(args.path));
      default: return { ok: false, summary: `Unknown tool: ${call.name}` };
    }
  } catch (error) {
    return { ok: false, summary: error.message || String(error) };
  }
}

function okTool(result) {
  return { ok: true, ...result };
}

async function formatActiveFile() {
  const file = activeFile.value;
  if (!file) return;

  try {
    const formatted = await formatCode(file.model.getValue(), file.language);
    if (formatted == null) {
      await editor.value?.getAction("editor.action.formatDocument")?.run();
      setStatus(tr("status.formatUnavailable"), getLanguageLabel(file.language));
      return;
    }

    file.model.pushEditOperations([], [{ range: file.model.getFullModelRange(), text: formatted }], () => null);
    setStatus(tr("status.formatted", { language: getLanguageLabel(file.language) }), file.path);
  } catch (error) {
    console.error(tr("error.format"), error);
    setStatus(tr("error.format"), error.message || "");
  }
}

const formatterDisposables = [];

function registerFormatters() {
  formatterDisposables.splice(0).forEach((disposable) => disposable.dispose());
  const languages = ["javascript", "typescript", "html", "css", "scss", "less", "json", "markdown", "graphql", "yaml"];

  languages.forEach((language) => {
    formatterDisposables.push(monaco.languages.registerDocumentFormattingEditProvider(language, {
      async provideDocumentFormattingEdits(model) {
        const file = getFileByModel(model);
        const formatted = await formatCode(model.getValue(), file?.language || language);
        return formatted == null ? [] : [{ range: model.getFullModelRange(), text: formatted }];
      },
    }));
  });
}

function getFileByModel(model) {
  return Array.from(openFiles.values()).find((file) => file.model === model);
}

async function formatCode(source, language) {
  const prettierConfig = getPrettierConfig(language);
  if (!prettierConfig) return null;

  const { prettier, plugins } = await loadPrettierBundle(prettierConfig.plugins);
  return prettier.format(source, {
    parser: prettierConfig.parser,
    plugins,
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false,
  });
}

function getPrettierConfig(language) {
  const configs = {
    javascript: { parser: "babel", plugins: ["babel", "estree"] },
    flow: { parser: "flow", plugins: ["flow", "estree"] },
    typescript: { parser: "typescript", plugins: ["typescript", "estree"] },
    html: { parser: "html", plugins: ["html"] },
    vue: { parser: "vue", plugins: ["html"] },
    angular: { parser: "angular", plugins: ["angular", "html"] },
    handlebars: { parser: "glimmer", plugins: ["glimmer"] },
    css: { parser: "css", plugins: ["postcss"] },
    scss: { parser: "scss", plugins: ["postcss"] },
    less: { parser: "less", plugins: ["postcss"] },
    json: { parser: "json", plugins: ["babel", "estree"] },
    jsonc: { parser: "jsonc", plugins: ["babel", "estree"] },
    json5: { parser: "json5", plugins: ["babel", "estree"] },
    markdown: { parser: "markdown", plugins: ["markdown"] },
    mdx: { parser: "mdx", plugins: ["markdown"] },
    graphql: { parser: "graphql", plugins: ["graphql"] },
    yaml: { parser: "yaml", plugins: ["yaml"] },
  };
  return configs[language] || null;
}

async function loadPrettierBundle(pluginNames) {
  if (!prettierStandalonePromise) {
    prettierStandalonePromise = CdnUtils.loadPrettierStandalone();
  }
  const [prettier, plugins] = await Promise.all([
    prettierStandalonePromise,
    Promise.all(pluginNames.map(loadPrettierPlugin)),
  ]);
  return { prettier, plugins };
}

function loadPrettierPlugin(name) {
  if (!prettierPluginPromises.has(name)) {
    prettierPluginPromises.set(name, CdnUtils.loadPrettierPlugin(name));
  }
  return prettierPluginPromises.get(name);
}

function toggleSidePanel() {
  sidePanelVisible.value = !sidePanelVisible.value;
  nextTick(() => editor.value?.layout());
}

function startSidebarResize(event) {
  if (!sidePanelVisible.value) return;
  event.preventDefault();
  sidebarResizing.value = true;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const move = (moveEvent) => {
    const activityWidth = document.querySelector(".activity-bar")?.getBoundingClientRect().width || 48;
    sidebarWidth.value = clampSidebarWidth(moveEvent.clientX - activityWidth);
    editor.value?.layout();
    diffEditor.value?.layout();
  };
  const stop = () => {
    sidebarResizing.value = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    nextTick(() => editor.value?.layout());
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
  move(event);
}

function clampSidebarWidth(value) {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(Number(value) || DEFAULT_SIDEBAR_WIDTH)));
}

function startPreviewResize(event) {
  if (!previewPaneVisible.value) return;
  event.preventDefault();
  previewResizing.value = true;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const stage = event.currentTarget.closest(".editor-stage");
  const move = (moveEvent) => {
    const stageRight = stage?.getBoundingClientRect().right || window.innerWidth;
    previewWidth.value = clampPreviewWidth(stageRight - moveEvent.clientX);
    layoutVisibleEditors();
  };
  const stop = () => {
    previewResizing.value = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    nextTick(layoutVisibleEditors);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
  move(event);
}

function clampPreviewWidth(value) {
  return Math.max(PREVIEW_MIN_WIDTH, Math.min(PREVIEW_MAX_WIDTH, Math.round(Number(value) || DEFAULT_PREVIEW_WIDTH)));
}

async function triggerAiCompletion() {
  if (!activeFile.value) return;
  abortAiCompletionRequest();
  aiCompletionManualUntil = Date.now() + AI_COMPLETION_MANUAL_TRIGGER_WINDOW_MS;
  aiCompletionRequestSerial += 1;
  await editor.value?.getAction("editor.action.inlineSuggest.trigger")?.run();
}

async function triggerFindReferences() {
  if (!activeFile.value) return;
  const targetEditor = activeDiffPath.value ? diffEditor.value?.getModifiedEditor?.() : editor.value;
  targetEditor?.focus?.();
  await targetEditor?.getAction("editor.action.referenceSearch.trigger")?.run();
}

function setStatus(left, right) {
  status.left = left;
  status.right = right || "";
}

function reportError(messageKey, error) {
  console.error(tr(messageKey), error);
  setStatus(tr(messageKey), error.message || "");
  showAlert(`${tr(messageKey)}: ${error.message || error}`, { tone: "danger" });
}

function beforeUnload(event) {
  if (!shouldConfirmLeaveEditor()) return;
  const message = tr("confirm.leaveWithSsh");
  event.preventDefault();
  event.returnValue = message;
  return message;
}

function handlePageHide() {
  closeAllSshSessions({ disposeTerminal: true });
}

function hasUnsavedFiles() {
  return Array.from(openFiles.values()).some((file) => file.dirty);
}

function shouldConfirmLeaveEditor() {
  return hasUnsavedFiles() || hasActiveSshSessions();
}

function hasActiveSshSessions() {
  return Array.from(sshSessions.values()).some(isSshSessionActive);
}

function isSshSessionActive(session) {
  return Boolean(session && !session.closing && (session.connected || session.ws?.readyState === WebSocket.CONNECTING || session.ws?.readyState === WebSocket.OPEN));
}

async function exportSettingsUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set(SETTINGS_URL_PARAM, encodeSettingsForUrl(settings));
  const value = url.toString();
  try {
    await navigator.clipboard.writeText(value);
    setStatus(tr("settings.exportUrlCopied"), SETTINGS_URL_PARAM);
  } catch {
    await showPrompt(tr("settings.exportUrl"), value, { title: tr("settings.exportUrl"), confirmLabel: tr("dialog.close"), selectOnFocus: true });
  }
}

function loadSettings() {
  try {
    const imported = readSettingsFromUrl();
    const saved = imported || JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const savedSettings = { ...saved };
    delete savedSettings.sidebarWidth;
    delete savedSettings.previewWidth;
    const shortcuts = { ...vscodeShortcuts, ...(savedSettings.shortcuts || {}) };
    const ai = { ...defaultAiSettings, ...(savedSettings.ai || {}) };
    const backend = { ...defaultBackendSettings, ...(savedSettings.backend || {}) };
    const ssh = { ...defaultSshSettings, ...(savedSettings.ssh || {}) };
    if (!aiReasoningEfforts.includes(ai.reasoningEffort)) ai.reasoningEffort = defaultAiSettings.reasoningEffort;
    backend.enabled = Boolean(backend.enabled);
    backend.baseUrl = normalizeBackendBaseUrlValue(backend.baseUrl) || defaultBackendSettings.baseUrl;
    if (!sshTerminalThemes[ssh.terminalTheme]) ssh.terminalTheme = defaultSshSettings.terminalTheme;
    ssh.whitelistTemplate = String(ssh.whitelistTemplate || DEFAULT_SSH_WHITELIST_TEMPLATE).trim();
    ssh.connections = Array.isArray(ssh.connections) ? ssh.connections.map(normalizeStoredSshConfig).filter(Boolean) : [];
    const loaded = { ...defaultSettings, ...savedSettings, shortcuts, ai, backend, ssh };
    if (imported) localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
    return loaded;
  } catch {
    return structuredClone(defaultSettings);
  }
}

function normalizeStoredSshConfig(value) {
  const config = normalizeSshConfig(value);
  if (!config.id) config.id = createSshConfigId();
  return config.name || config.host ? config : null;
}

function readSettingsFromUrl() {
  const encoded = new URLSearchParams(window.location.search).get(SETTINGS_URL_PARAM);
  if (!encoded) return null;
  return JSON.parse(decodeSettingsFromUrl(encoded));
}

function encodeSettingsForUrl(value) {
  const json = JSON.stringify(JSON.parse(JSON.stringify(value)));
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSettingsFromUrl(value) {
  const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(value).length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function persistSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function shouldHideName(name) {
  return name === ".git" || name === "node_modules" || name === ".DS_Store";
}

function isReadableTextFile(file) {
  return file.size <= WORKSPACE_MODEL_MAX_FILE_SIZE && FileUtils.isTextFile(file);
}

function normalizeWorkspacePath(path) {
  const normalized = decodeWorkspacePath(path).trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!normalized || normalized.split("/").some((part) => part === "..")) throw new Error(tr("error.invalidPath"));
  return normalized;
}

function decodeWorkspacePath(path) {
  const value = String(path || "");
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function findNodeByPath(nodes, path) {
  for (const node of nodes) {
    if (node.path === path) return node;
    const match = findNodeByPath(node.children || [], path);
    if (match) return match;
  }
  return null;
}

function flattenTree(nodes, maxItems = 200) {
  const items = [];
  const visit = (node) => {
    if (items.length >= maxItems) return;
    items.push({ path: node.path, kind: node.kind });
    (node.children || []).forEach(visit);
  };
  nodes.forEach(visit);
  return items;
}

function listTreeLevel(nodes, maxItems = 200) {
  return nodes.slice(0, maxItems).map((node) => ({ path: node.path, kind: node.kind }));
}

function isTextFileState(file) {
  return Boolean(file?.model && file.fileType === "text");
}

async function ensureFileState(path, options = {}) {
  const normalized = normalizeWorkspacePath(path);
  const existing = openFiles.get(normalized);
  if (existing) {
    if (!isTextFileState(existing)) throw new Error(`File is not readable text: ${normalized}`);
    existing.fileType = "text";
    return existing;
  }
  const node = findNodeByPath(tree.value, normalized);
  if (!node || node.kind !== "file") {
    if (options.create) return createVirtualFileState(normalized, options);
    throw new Error(`File not found: ${normalized}`);
  }
  const file = await node.handle.getFile();
  if (!isReadableTextFile(file)) throw new Error(`File is not readable text: ${normalized}`);
  const content = await file.text();
  const language = getLanguageId(node.name);
  const monacoLanguage = getMonacoLanguageId(language);
  const model = getOrCreateWorkspaceModel(content, monacoLanguage, node.path, true);
  workspaceModelPaths.delete(node.path);
  const originalModel = createOriginalModel(content, monacoLanguage, node.path);
  const fileState = { name: node.name, path: node.path, handle: markRaw(node.handle), fileType: "text", model, originalModel, savedValue: content, dirty: false, closed: options.closed ?? true, language, monacoLanguage, isNew: false, deleted: false };
  fileState.modelContentDisposable = model.onDidChangeContent(() => updateDirtyState(fileState));
  openFiles.set(node.path, fileState);
  touchDirtyState();
  return fileState;
}

async function ensureAnyFileState(path, options = {}) {
  const normalized = normalizeWorkspacePath(path);
  const existing = openFiles.get(normalized);
  if (existing) {
    const nextClosed = options.closed ?? existing.closed;
    if (existing.closed !== nextClosed) {
      existing.closed = nextClosed;
      openFiles.set(normalized, existing);
      touchDirtyState();
    }
    return existing;
  }
  const node = findNodeByPath(tree.value, normalized);
  if (!node || node.kind !== "file") {
    if (options.create) return createVirtualFileState(normalized, options);
    throw new Error(`File not found: ${normalized}`);
  }
  const diskFile = await node.handle.getFile();
  if (FileUtils.isImageFile(diskFile)) return createImageFileState(node, diskFile, options);
  if (!isReadableTextFile(diskFile)) return createUnsupportedFileState(node, diskFile, options);
  return ensureFileState(normalized, options);
}

function createVirtualFileState(path, options = {}) {
  const name = path.split("/").pop();
  const content = String(options.content ?? "");
  const language = getLanguageId(name);
  const monacoLanguage = getMonacoLanguageId(language);
  const model = getOrCreateWorkspaceModel(content, monacoLanguage, path, true);
  workspaceModelPaths.delete(path);
  const originalModel = createOriginalModel("", monacoLanguage, path);
  const fileState = { name, path, handle: null, fileType: "text", model, originalModel, savedValue: "", dirty: true, closed: options.closed ?? true, language, monacoLanguage, isNew: true, deleted: false };
  fileState.modelContentDisposable = model.onDidChangeContent(() => updateDirtyState(fileState));
  openFiles.set(path, fileState);
  touchDirtyState();
  return fileState;
}

async function aiToolListFiles({ path = "", max_items: maxItems = 200, recursive = false } = {}) {
  const nodes = path ? [findNodeByPath(tree.value, normalizeWorkspacePath(path))].filter(Boolean) : tree.value;
  if (!nodes.length) throw new Error(path ? `Path not found: ${path}` : "No files loaded");
  const limit = Math.max(1, Math.min(Number(maxItems) || 200, 1000));
  const sourceNodes = path && nodes[0]?.kind === "directory" ? nodes[0].children || [] : nodes;
  const items = recursive ? flattenTree(nodes, limit) : listTreeLevel(sourceNodes, limit);
  return { summary: `${items.length} item(s)`, items };
}

async function aiToolRefreshTree({ collapse_all: collapseAll = false } = {}) {
  if (!rootHandle.value) throw new Error("No workspace loaded");
  await refreshTree({ collapseAll: Boolean(collapseAll) });
  const count = countTreeNodes(diskTree.value);
  return { summary: `Refreshed ${count} item(s)`, count };
}

async function aiToolReadFile({ path, offset, limit } = {}) {
  const file = await ensureFileState(path, { closed: true });
  const content = file.model.getValue();
  const maxLength = 120000;
  const partial = getLineBasedContentSlice(content, { offset, limit, maxChars: maxLength });
  return { path: file.path, language: file.language, dirty: file.dirty, deleted: Boolean(file.deleted), ...partial };
}

async function aiToolReadImage(path) {
  const normalized = normalizeWorkspacePath(path);
  const opened = openFiles.get(normalized);
  let file;
  if (opened) {
    if (opened.fileType !== "image") throw new Error(`File is not an image: ${normalized}`);
    if (!opened.handle) throw new Error(`Image has no readable file handle: ${normalized}`);
    file = await opened.handle.getFile();
  } else {
    const node = findNodeByPath(tree.value, normalized);
    if (!node || node.kind !== "file") throw new Error(`File not found: ${normalized}`);
    file = await node.handle.getFile();
  }
  if (!FileUtils.isImageFile(file)) throw new Error(`File is not an image: ${normalized}`);
  if (file.size > AI_IMAGE_MAX_FILE_SIZE) throw new Error(`Image is too large: ${normalized}`);
  const mimeType = FileUtils.getImageMimeType(file.name || normalized, file.type);
  const dataUrl = FileUtils.normalizeImageDataUrl(await FileUtils.readFileAsDataUrl(file), mimeType);
  return { path: normalized, mimeType, size: file.size, dataUrl };
}

async function aiToolReadFiles({ paths, offset, limit, max_chars_per_file: maxCharsPerFile = 60000 } = {}) {
  if (!Array.isArray(paths) || !paths.length) throw new Error("paths is required");
  const maxChars = Math.max(1000, Math.min(Number(maxCharsPerFile) || 60000, 120000));
  const files = [];
  for (const path of paths.slice(0, 20)) {
    const file = await ensureFileState(path, { closed: true });
    const content = file.model.getValue();
    files.push({ path: file.path, language: file.language, dirty: file.dirty, deleted: Boolean(file.deleted), ...getLineBasedContentSlice(content, { offset, limit, maxChars }) });
  }
  return { summary: `Read ${files.length} file(s)`, files };
}

function getLineBasedContentSlice(content, { offset, limit, maxChars }) {
  const text = String(content ?? "");
  const maxLength = Math.max(1, Math.min(Number(maxChars) || 120000, 120000));
  const hasLineRange = offset != null || limit != null;
  if (!hasLineRange) return { truncated: text.length > maxLength, content: text.slice(0, maxLength) };

  const lines = text.split(/\r?\n/);
  const totalLines = lines.length;
  const startLine = Math.max(1, Math.floor(Number(offset) || 1));
  const startIndex = Math.min(startLine - 1, totalLines);
  const maxLines = limit == null ? totalLines - startIndex : Math.max(1, Math.floor(Number(limit) || 1));
  const endIndex = Math.min(totalLines, startIndex + maxLines);
  const sliced = lines.slice(startIndex, endIndex).join("\n");
  const truncatedByChars = sliced.length > maxLength;
  return {
    start_line: startIndex < totalLines ? startIndex + 1 : totalLines + 1,
    end_line: endIndex,
    total_lines: totalLines,
    truncated: startIndex > 0 || endIndex < totalLines || truncatedByChars,
    content: sliced.slice(0, maxLength),
  };
}

async function aiToolSearchText({ query, path = "", max_results: maxResults = 30 } = {}) {
  if (!query) throw new Error("query is required");
  const rootNodes = path ? [findNodeByPath(tree.value, normalizeWorkspacePath(path))].filter(Boolean) : tree.value;
  const fileNodes = flattenTree(rootNodes, 2000).filter((item) => item.kind === "file");
  const results = [];
  const limit = Math.max(1, Math.min(Number(maxResults) || 30, 100));
  for (const item of fileNodes) {
    if (results.length >= limit) break;
    try {
      const file = await ensureFileState(item.path, { closed: true });
      const lines = file.model.getValue().split(/\r?\n/);
      lines.forEach((line, index) => {
        if (results.length < limit && line.includes(query)) results.push({ path: file.path, line: index + 1, text: line.trim().slice(0, 240) });
      });
    } catch {
      // Ignore unreadable files during broad searches.
    }
  }
  return { summary: `${results.length} match(es)`, results };
}

async function aiToolRunJavaScript({ code, input = {}, timeout_ms: timeoutMs } = {}) {
  const script = String(code || "");
  if (!script.trim()) return { ok: false, summary: "JavaScript code is required" };
  if (script.length > AI_JAVASCRIPT_MAX_CODE_CHARS) return { ok: false, summary: `JavaScript code is too large: ${script.length} chars` };
  if (!window.Worker || !window.Blob || !window.URL) return { ok: false, summary: "Web Worker is not available in this browser" };

  const timeout = Math.max(100, Math.min(Number(timeoutMs) || AI_JAVASCRIPT_DEFAULT_TIMEOUT_MS, AI_JAVASCRIPT_MAX_TIMEOUT_MS));
  const logs = [];
  const startedAt = performance.now();

  return new Promise((resolve) => {
    let worker = null;
    let objectUrl = "";
    let timer = 0;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker?.terminate();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve({ elapsed_ms: Math.round(performance.now() - startedAt), logs, ...result });
    };

    try {
      objectUrl = URL.createObjectURL(new Blob([createAiJavaScriptWorkerSource()], { type: "application/javascript" }));
      worker = new Worker(objectUrl);
      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.type === "log") {
          logs.push(data.log);
          if (logs.length > AI_JAVASCRIPT_MAX_LOGS) logs.shift();
          return;
        }
        if (data.type !== "done") return;
        if (data.ok) {
          finish({ ok: true, summary: `JavaScript completed in ${data.elapsed_ms}ms`, result: data.result });
          return;
        }
        finish({ ok: false, summary: `JavaScript failed: ${data.error?.message || "Unknown error"}`, error: data.error });
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        finish({ ok: false, summary: `JavaScript worker error: ${event.message || "Unknown error"}`, error: { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno } });
      };
      timer = window.setTimeout(() => {
        finish({ ok: false, summary: `JavaScript timed out after ${timeout}ms`, error: { message: `Timed out after ${timeout}ms` } });
      }, timeout);
      worker.postMessage({ code: script, input });
    } catch (error) {
      finish({ ok: false, summary: error.message || String(error), error: { message: error.message || String(error) } });
    }
  });
}

function createAiJavaScriptWorkerSource() {
  return String.raw`
const MAX_LOGS = ${AI_JAVASCRIPT_MAX_LOGS};
const MAX_STRING_LENGTH = 8000;
const MAX_COLLECTION_ITEMS = 100;
const MAX_DEPTH = 5;
const nativePostMessage = self.postMessage.bind(self);

Object.defineProperty(self, "postMessage", {
  value() { throw new Error("postMessage is disabled in run_javascript"); },
  configurable: false,
});

function clipString(value) {
  const text = String(value);
  return text.length > MAX_STRING_LENGTH ? text.slice(0, MAX_STRING_LENGTH) + "... [truncated]" : text;
}

function safeValue(value, depth = 0, seen = []) {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return clipString(value);
  if (typeof value === "bigint") return value.toString() + "n";
  if (typeof value === "symbol") return String(value);
  if (typeof value === "function") return "[Function" + (value.name ? " " + value.name : "") + "]";
  if (value instanceof Error) return { name: value.name, message: value.message, stack: clipString(value.stack || "") };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  if (depth >= MAX_DEPTH) return "[MaxDepth]";
  if (seen.includes(value)) return "[Circular]";

  const nextSeen = seen.concat(value);
  if (Array.isArray(value)) {
    const output = value.slice(0, MAX_COLLECTION_ITEMS).map((item) => safeValue(item, depth + 1, nextSeen));
    if (value.length > MAX_COLLECTION_ITEMS) output.push("[" + (value.length - MAX_COLLECTION_ITEMS) + " more items]");
    return output;
  }
  if (value instanceof Map) {
    const entries = Array.from(value.entries()).slice(0, MAX_COLLECTION_ITEMS).map(([key, item]) => [safeValue(key, depth + 1, nextSeen), safeValue(item, depth + 1, nextSeen)]);
    return { type: "Map", size: value.size, entries };
  }
  if (value instanceof Set) {
    const values = Array.from(value.values()).slice(0, MAX_COLLECTION_ITEMS).map((item) => safeValue(item, depth + 1, nextSeen));
    return { type: "Set", size: value.size, values };
  }

  const output = {};
  const entries = Object.entries(value);
  entries.slice(0, MAX_COLLECTION_ITEMS).forEach(([key, item]) => { output[key] = safeValue(item, depth + 1, nextSeen); });
  if (entries.length > MAX_COLLECTION_ITEMS) output.__truncated_keys = entries.length - MAX_COLLECTION_ITEMS;
  return output;
}

const logs = [];
function emitLog(level, args) {
  const log = { level, args: args.map((arg) => safeValue(arg)) };
  logs.push(log);
  if (logs.length > MAX_LOGS) logs.shift();
  nativePostMessage({ type: "log", log });
}

["debug", "log", "info", "warn", "error"].forEach((level) => {
  console[level] = (...args) => emitLog(level, args);
});

self.onmessage = async (event) => {
  const startedAt = performance.now();
  try {
    const payload = event.data || {};
    const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
    const run = new AsyncFunction("input", "\"use strict\";\n" + String(payload.code || ""));
    const result = await run(payload.input);
    nativePostMessage({ type: "done", ok: true, result: safeValue(result), elapsed_ms: Math.round(performance.now() - startedAt) });
  } catch (error) {
    nativePostMessage({ type: "done", ok: false, error: safeValue(error), elapsed_ms: Math.round(performance.now() - startedAt) });
  }
};
`;
}

async function aiToolRequestProxy({ url, method = "GET", headers = {}, body, follow_redirect: followRedirect = true, enable_cors: enableCors = true, max_chars: maxChars = 20000 } = {}) {
  validateBackendEnabled();
  if (!url) throw new Error("url is required");
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("Only http and https URLs are supported");
  const requestMethod = String(method || "GET").trim().toUpperCase();
  if ((requestMethod === "GET" || requestMethod === "HEAD") && body != null) throw new Error(`${requestMethod} requests cannot include a body`);

  const requestHeaders = buildProxyRequestHeaders(headers);
  const proxyUrl = buildRequestProxyUrl(target, enableCors, followRedirect);

  const response = await fetch(proxyUrl, {
    method: requestMethod,
    headers: requestHeaders,
    body: requestMethod === "GET" || requestMethod === "HEAD" ? undefined : String(body ?? ""),
    credentials: "omit",
  });
  const text = await response.text();
  const limit = Math.max(1000, Math.min(Number(maxChars) || 20000, 120000));
  return {
    summary: `${requestMethod} ${target.href} -> ${response.status} (${Math.min(text.length, limit)} chars)`,
    url: target.href,
    status: response.status,
    status_text: response.statusText,
    http_ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    truncated: text.length > limit,
    body: text.slice(0, limit),
  };
}

function buildRequestProxyUrl(target, enableCors, followRedirect) {
  const separator = target.search ? "&" : "?";
  const proxyParams = new URLSearchParams({
    "X-Proxy-Host": target.origin,
    "X-Proxy-Cors": enableCors ? "true" : "false",
    "X-Proxy-Follow-Redirect": followRedirect ? "true" : "false",
  });
  return `${getBackendBaseUrl()}${REQUEST_PROXY_PATH}${target.pathname || "/"}${target.search}${separator}${proxyParams.toString()}`;
}

function buildProxyRequestHeaders(headers) {
  const requestHeaders = new Headers();
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return requestHeaders;
  Object.entries(headers).forEach(([name, value]) => {
    if (value == null || shouldSkipProxyRequestHeader(name)) return;
    requestHeaders.set(name, String(value));
  });
  return requestHeaders;
}

function shouldSkipProxyRequestHeader(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return ["host", "connection", "content-length", "transfer-encoding", "upgrade", "expect", "proxy-host", "proxy-cors", "proxy-follow-redirect"].includes(normalized);
}

function aiToolGetSshConnections() {
  const connections = getAiExposedSshConfigs().map((connection) => ({
    id: connection.id,
    name: connection.name,
    host: connection.host,
    port: connection.port || 22,
    username: connection.username,
    active: isSshConnected(connection.id),
    whitelist: connection.whitelist || [],
  }));
  return { summary: `${connections.length} SSH connection(s) exposed to AI`, connections };
}

async function aiToolOpenSshConnection(identifier) {
  const config = getAiExposedSshConfig(identifier);
  const session = await connectSshConfig(config);
  await waitForSshSessionConnected(session);
  return { summary: `Opened SSH connection ${config.name || config.host}`, connection: formatAiSshConnection(config, session) };
}

async function waitForSshSessionConnected(session, timeoutMs = SSH_CONNECT_TIMEOUT_MS) {
  if (!session) throw new Error(tr("ssh.disconnected"));
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (session.connected) return session;
    if (session.connectFailed) throw new Error(tr("ssh.connectFailed"));
    if (session.closing || session.ws?.readyState === WebSocket.CLOSED) throw new Error(tr("ssh.disconnected"));
    await delay(100);
  }
  throw new Error(tr("ssh.connectFailed"));
}

function aiToolActivateSshTerminal(identifier) {
  const config = getAiExposedSshConfig(identifier);
  const session = getActiveSshSessionForConfig(config);
  activateSshTerminal(config.id);
  return { summary: `Activated SSH terminal ${config.name || config.host}`, connection: formatAiSshConnection(config, session) };
}

function aiToolCloseSshConnection(identifier) {
  const config = getAiExposedSshConfig(identifier);
  disconnectSshConfig(config.id);
  return { summary: `Closed SSH connection ${config.name || config.host}`, connection: formatAiSshConnection(config, sshSessions.get(config.id)) };
}

function aiToolReadSshOutput({ connection, max_chars: maxChars = 20000 } = {}) {
  const config = getAiExposedSshConfig(connection);
  const session = getActiveSshSessionForConfig(config);
  const limit = Math.max(1000, Math.min(Number(maxChars) || 20000, SSH_OUTPUT_MAX_CHARS));
  const output = String(session.output || "");
  return { summary: `Read ${Math.min(output.length, limit)} SSH output chars from ${config.name || config.host}`, connection: formatAiSshConnection(config, session), truncated: output.length > limit, output: output.slice(-limit) };
}

async function aiToolExecuteSshCommand({ connection, command, commands, high_risk: highRisk, reason } = {}) {
  const config = getAiExposedSshConfig(connection);
  const session = getActiveSshSessionForConfig(config);
  const normalizedCommand = String(command || "").trim();
  const mainCommands = normalizeAiSshCommandList(commands);
  const normalizedReason = String(reason || "").trim();
  if (!normalizedCommand) throw new Error("command is required");
  if (!mainCommands.length) throw new Error(tr("ssh.error.commandListRequired"));
  if (typeof highRisk !== "boolean") throw new Error("high_risk is required");
  if (!normalizedReason) throw new Error(tr("ssh.error.commandReasonRequired"));
  await authorizeAiSshCommand(config, normalizedCommand, mainCommands, highRisk, normalizedReason);
  const beforeLength = String(session.output || "").length;
  sendSshCommand(session, normalizedCommand);
  await delay(SSH_COMMAND_OUTPUT_WAIT_MS);
  const output = String(session.output || "").slice(beforeLength).slice(-20000);
  return { summary: tr("ssh.toolExecutedCommand", { command: normalizedCommand, reason: normalizedReason }), connection: formatAiSshConnection(config, session), command: normalizedCommand, commands: mainCommands, high_risk: highRisk, reason: normalizedReason, output };
}

function getAiExposedSshConfig(identifier) {
  const value = String(identifier || "").trim();
  const config = getAiExposedSshConfigs().find((connection) => connection.id === value || connection.name === value || connection.host === value);
  if (!config) throw new Error(tr("ssh.error.notExposed"));
  return config;
}

function getActiveSshSessionForConfig(config) {
  const session = sshSessions.get(config.id);
  if (!session?.connected) throw new Error(tr("ssh.disconnected"));
  return session;
}

function formatAiSshConnection(config, session) {
  return { id: config.id, name: config.name, host: config.host, port: config.port || 22, username: config.username, active: Boolean(session?.connected), whitelist: config.whitelist || [] };
}

async function authorizeAiSshCommand(config, command, mainCommands, highRisk, reason) {
  const whitelisted = areSshMainCommandsWhitelisted(config, mainCommands);
  if (!highRisk && whitelisted) return;
  const messageKey = highRisk ? "ssh.confirmHighRiskCommand" : "ssh.confirmUnauthorizedCommand";
  const approved = await showConfirm(tr(messageKey, { name: config.name || config.host, command, commands: mainCommands.join(", "), reason }), { title: tr("ssh.run"), tone: "danger" });
  if (!approved) throw new Error(tr("ssh.error.commandRejected"));
}

function areSshMainCommandsWhitelisted(config, mainCommands) {
  const whitelist = new Set(normalizeSshWhitelist(config.whitelist || []).map(normalizeMainCommandName));
  return mainCommands.length > 0 && mainCommands.every((command) => whitelist.has(command));
}

function normalizeAiSshCommandList(commands) {
  if (!Array.isArray(commands)) return [];
  return uniqueStrings(commands.map(normalizeMainCommandName)).filter(Boolean);
}

function normalizeMainCommandName(command) {
  const value = String(command || "").trim();
  if (!value || /\s/.test(value)) return "";
  return value;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function aiToolGetCurrentFile() {
  const file = activeFile.value;
  if (!file) return { summary: "No active file" };
  const selection = editor.value?.getSelection();
  const selectedText = selection && isTextFileState(file) ? file.model.getValueInRange(selection) : "";
  return { path: file.path, language: file.language, file_type: file.fileType, dirty: file.dirty, deleted: Boolean(file.deleted), position: isTextFileState(file) ? editor.value?.getPosition() : null, selection: selectedText.slice(0, 8000) };
}

async function aiToolReplaceInFile({ path, old_text: oldText, new_text: newText }, session = getActiveAiSession()) {
  if (!oldText) throw new Error("old_text is required");
  const file = await ensureFileState(path, { closed: true });
  if (file.deleted) throw new Error(`File is marked for deletion: ${file.path}`);
  const content = file.model.getValue();
  const index = content.indexOf(oldText);
  if (index === -1) throw new Error(`Text not found in ${file.path}`);
  file.model.setValue(`${content.slice(0, index)}${newText}${content.slice(index + oldText.length)}`);
  markAiTouchedFile(file, session);
  updateDirtyState(file);
  setStatus(tr("status.aiChangedFile", { path: file.path }), tr("status.unsaved"));
  return { summary: `Changed ${file.path}`, path: file.path, dirty: file.dirty };
}

async function aiToolReplaceInFiles({ edits } = {}, session = getActiveAiSession()) {
  if (!Array.isArray(edits) || !edits.length) throw new Error("edits is required");
  const results = [];
  for (const [index, edit] of edits.slice(0, 50).entries()) {
    const editNumber = index + 1;
    try {
      results.push({ index, edit_number: editNumber, ok: true, ...(await aiToolReplaceInFile(edit, session)) });
    } catch (error) {
      results.push({
        index,
        edit_number: editNumber,
        ok: false,
        path: edit?.path || null,
        error: error.message || String(error),
      });
    }
  }
  const applied = results.filter((result) => result.ok).length;
  const failed = results.length - applied;
  const failedEditNumbers = results.filter((result) => !result.ok).map((result) => result.edit_number);
  return { summary: `Applied ${applied}/${results.length} edit(s)${failed ? `; failed edit(s): ${failedEditNumbers.join(", ")}` : ""}`, applied, failed, failed_edit_numbers: failedEditNumbers, results };
}

async function aiToolWriteFile({ path, content }, session = getActiveAiSession()) {
  const file = await ensureFileState(path, { closed: true, create: true });
  const created = Boolean(file.isNew);
  markAiTouchedFile(file, session);
  if (created) file.aiCreated = true;
  file.deleted = false;
  file.model.setValue(String(content ?? ""));
  updateDirtyState(file);
  setStatus(tr("status.aiChangedFile", { path: file.path }), tr("status.unsaved"));
  return { summary: `${created ? "Created" : "Changed"} ${file.path}`, path: file.path, dirty: file.dirty, created };
}

async function aiToolDeleteFile(path, session = getActiveAiSession()) {
  const normalized = normalizeWorkspacePath(path);
  const file = openFiles.get(normalized);
  if (file?.isNew && !file.handle) {
    removeFileState(normalized);
    setStatus(tr("status.deleted", { path: normalized }), tr("status.unsaved"));
    return { summary: `Removed unsaved new file ${normalized}`, path: normalized, deleted: true, pending: false };
  }
  const deletedFile = await markFileDeleted(normalized, { closed: true });
  markAiTouchedFile(deletedFile, session);
  return { summary: `Marked ${deletedFile.path} for deletion`, path: deletedFile.path, deleted: true, pending: true, dirty: deletedFile.dirty };
}

async function aiToolOpenFile(path) {
  const file = await ensureAnyFileState(path, { closed: false });
  file.closed = false;
  activateFile(file.path);
  return { summary: `Opened ${file.path}`, path: file.path };
}

async function aiToolShowDiff(path) {
  const file = await ensureAnyFileState(path, { closed: true });
  activateDiff(file.path);
  return { summary: `Showing diff for ${file.path}`, path: file.path, file_type: file.fileType, dirty: file.dirty };
}

async function markFileDeleted(path, options = {}) {
  const file = await ensureAnyFileState(path, { closed: options.closed ?? true });
  if (file.isNew && !file.handle) {
    removeFileState(file.path);
    return file;
  }
  file.deleted = true;
  file.isNew = false;
  file.closed = options.closed ?? file.closed;
  if (isTextFileState(file)) file.model.setValue("");
  else refreshReadonlyPreviewModel(file);
  file.dirty = true;
  openFiles.set(file.path, file);
  touchDirtyState();
  if (activePath.value === file.path && !activeDiffPath.value) activateDiff(file.path);
  setStatus(tr("status.pendingDelete", { path: file.path }), tr("status.unsaved"));
  return file;
}

async function removeFileFromDisk(path) {
  const normalized = normalizeWorkspacePath(path);
  const parts = normalized.split("/");
  const fileName = parts.pop();
  const directory = await getDirectoryByParts(parts, false);
  await directory.removeEntry(fileName);
}

async function createFileOnDisk(path) {
  const handle = await getFileHandleForPath(path, true);
  const writable = await handle.createWritable();
  await writable.write("");
  await writable.close();
}

async function getFileHandleForPath(path, create) {
  const normalized = normalizeWorkspacePath(path);
  const parts = normalized.split("/");
  const fileName = parts.pop();
  const directory = await getDirectoryByParts(parts, create);
  return markRaw(await directory.getFileHandle(fileName, { create }));
}

async function getDirectoryByParts(parts, create) {
  let directory = rootHandle.value;
  for (const part of parts) {
    if (part) directory = await directory.getDirectoryHandle(part, { create });
  }
  return directory;
}

function getOpenFilesUnderPath(path) {
  return Array.from(openFiles.values()).filter((file) => file.path === path || file.path.startsWith(`${path}/`));
}

function closeOpenFilesUnderPath(path) {
  getOpenFilesUnderPath(path).forEach((file) => {
    disposeFileModels(file, { force: true });
    openFiles.delete(file.path);
  });
  if (activePath.value === path || activePath.value.startsWith(`${path}/`)) {
    activateLastOpenFile(path);
  }
}

function disposeFileModels(file, { force = false } = {}) {
  if (file.objectUrl) {
    URL.revokeObjectURL(file.objectUrl);
    file.objectUrl = "";
  }
  file.modelContentDisposable?.dispose();
  if (force || !workspaceModelPaths.has(file.path)) {
    file.model?.dispose();
    workspaceModelPaths.delete(file.path);
    workspaceModelPromises.delete(file.path);
  }
  file.originalModel?.dispose();
}

function countTreeNodes(nodes) {
  return nodes.reduce((total, node) => total + 1 + countTreeNodes(node.children || []), 0);
}

function getLanguageId(fileName) {
  const name = String(fileName || "").split(/[\\/]/).pop().toLowerCase();
  const extension = FileUtils.getFileExtension(name);
  const index = getMonacoLanguageIndex();
  return index.byFileName.get(name) || index.byExtension.get(extension) || "plaintext";
}

function getLanguageLabel(languageId) {
  return languageOptions.find((item) => item.id === languageId)?.label || languageId;
}

function getMonacoLanguageId(languageId) {
  if (getMonacoLanguageIndex().ids.has(languageId)) return languageId;
  return "plaintext";
}

function getMonacoLanguageIndex() {
  if (monacoLanguageIndex) return monacoLanguageIndex;
  if (!monaco?.languages?.getLanguages) return { byExtension: new Map(), byFileName: new Map(), ids: new Set() };
  const byExtension = new Map();
  const byFileName = new Map();
  const ids = new Set();
  monaco?.languages?.getLanguages?.().forEach((language) => {
    ids.add(language.id);
    (language.extensions || []).forEach((extension) => byExtension.set(extension.replace(/^\./, "").toLowerCase(), language.id));
    (language.filenames || []).forEach((fileName) => byFileName.set(fileName.toLowerCase(), language.id));
  });
  monacoLanguageIndex = { byExtension, byFileName, ids };
  return monacoLanguageIndex;
}

function getTreeIconClass(node, collapsed = false) {
  if (node.kind === "directory") return collapsed ? "folder-icon codicon-folder" : "folder-icon codicon-folder-opened";
  const language = getLanguageId(node.name);
  const icons = { bat: "file-terminal codicon-terminal-cmd", c: "file-js codicon-file-code", cpp: "file-js codicon-file-code", csharp: "file-js codicon-symbol-class", css: "file-css codicon-symbol-color", dockerfile: "file-terminal codicon-package", go: "file-go codicon-symbol-method", graphql: "file-json codicon-graph", html: "file-html codicon-code", ini: "file-json codicon-settings", java: "file-js codicon-symbol-class", javascript: "file-js codicon-symbol-method", json: "file-json codicon-json", markdown: "file-md codicon-markdown", php: "file-js codicon-file-code", powershell: "file-terminal codicon-terminal-powershell", python: "file-py codicon-file-code", ruby: "file-rust codicon-ruby", rust: "file-rust codicon-symbol-namespace", scss: "file-scss codicon-symbol-color", shell: "file-terminal codicon-terminal-bash", sql: "file-db codicon-database", typescript: "file-ts codicon-symbol-method", xml: "file-html codicon-code", yaml: "file-yaml codicon-symbol-key" };
  return icons[language] || "codicon-file";
}
</script>

<style>
.code-editor-view.app-shell {
  color-scheme: dark;
  --activity: #181818;
  --button: #333333;
  --button-hover: #3c3c3c;
  --button-hover-border: #555555;
  --panel: #252526;
  --panel-soft: #2d2d30;
  --editor: #1e1e1e;
  --tab: #2d2d2d;
  --tab-active: #1e1e1e;
  --border: #3c3c3c;
  --text: #cccccc;
  --muted: #8f8f8f;
  --accent: #007acc;
  --accent-strong: #3794ff;
  --status: #007acc;
  --status-text: #ffffff;
  --status-control-bg: rgb(255 255 255 / 14%);
  --status-control-hover: rgb(255 255 255 / 24%);
  --status-control-border: rgb(255 255 255 / 35%);
  --input: #1f1f1f;
  --context-hover: #094771;
  --shadow: rgb(0 0 0 / 40%);
  --folder-icon: #dcb67a;
  --file-icon: #c5c5c5;
  --preview-pane-size: min(var(--preview-pane-width, 480px), calc(100% - 160px));
  display: grid;
  grid-template-columns: 48px minmax(0, var(--side-panel-width, 300px)) minmax(0, 1fr);
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--editor);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.code-editor-view.theme-vs {
  color-scheme: light;
  --activity: #f3f3f3;
  --button: #f6f6f6;
  --button-hover: #e8e8e8;
  --button-hover-border: #c8c8c8;
  --panel: #f8f8f8;
  --panel-soft: #ffffff;
  --editor: #ffffff;
  --tab: #ececec;
  --tab-active: #ffffff;
  --border: #d0d0d0;
  --text: #1f1f1f;
  --muted: #616161;
  --accent: #006ab1;
  --accent-strong: #006ab1;
  --status: #007acc;
  --status-text: #ffffff;
  --status-control-bg: rgb(255 255 255 / 16%);
  --status-control-hover: rgb(255 255 255 / 26%);
  --status-control-border: rgb(255 255 255 / 38%);
  --input: #ffffff;
  --context-hover: #dbeeff;
  --shadow: rgb(0 0 0 / 18%);
  --folder-icon: #c18401;
  --file-icon: #424242;
}

.code-editor-view.theme-hc-black {
  color-scheme: dark;
  --activity: #000000;
  --button: #000000;
  --button-hover: #1a1a1a;
  --button-hover-border: #ffffff;
  --panel: #000000;
  --panel-soft: #050505;
  --editor: #000000;
  --tab: #000000;
  --tab-active: #000000;
  --border: #6fc3df;
  --text: #ffffff;
  --muted: #d7d7d7;
  --accent: #ffff00;
  --accent-strong: #ffff00;
  --status: #000000;
  --status-text: #ffffff;
  --status-control-bg: #000000;
  --status-control-hover: #1a1a1a;
  --status-control-border: #ffff00;
  --input: #000000;
  --context-hover: #1f4f99;
  --shadow: rgb(255 255 255 / 24%);
  --folder-icon: #ffff00;
  --file-icon: #ffffff;
}

.code-editor-view *,
.code-editor-view *::before,
.code-editor-view *::after { box-sizing: border-box; }
.code-editor-view button,
.code-editor-view input,
.code-editor-view select,
.code-editor-view textarea { font: inherit; }
.code-editor-view button { border: 1px solid var(--border); border-radius: 4px; background: var(--button); color: var(--text); cursor: pointer; }
.code-editor-view button:hover:not(:disabled) { background: var(--button-hover); border-color: var(--button-hover-border); }
.code-editor-view button:disabled { cursor: not-allowed; opacity: 0.45; }
.code-editor-view.app-shell.side-panel-hidden { grid-template-columns: 48px 0 minmax(0, 1fr); }
.code-editor-view.app-shell.resizing { cursor: col-resize; user-select: none; }
.code-editor-view .activity-bar { display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding: 8px 0; background: var(--activity); border-right: 1px solid var(--border); }
.code-editor-view .activity-button { width: 48px; height: 48px; border: 0; border-left: 2px solid transparent; border-radius: 0; background: transparent; color: var(--muted); }
.code-editor-view .activity-button.active { border-left-color: var(--accent-strong); color: var(--text); }
.code-editor-view .activity-button span { font-size: 22px; }
.code-editor-view .side-panel { position: relative; min-width: 0; overflow: hidden; background: var(--panel); border-right: 1px solid var(--border); }
.code-editor-view.side-panel-hidden .side-panel { border-right: 0; }
.code-editor-view .side-panel-resizer { position: absolute; top: 0; right: 0; z-index: 5; width: 6px; height: 100%; background: transparent; cursor: col-resize; }
.code-editor-view .side-panel-resizer:hover,
.code-editor-view.app-shell.resizing .side-panel-resizer { background: var(--accent); opacity: 0.35; }
.code-editor-view.side-panel-hidden .side-panel-resizer { display: none; }
.code-editor-view .panel-view { display: flex; height: 100%; min-height: 0; flex-direction: column; }
.code-editor-view .panel-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 14px 10px; }
.code-editor-view .panel-title { min-width: 0; }
.code-editor-view .panel-header h1 { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.code-editor-view .eyebrow { margin: 0 0 3px; color: var(--muted); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.code-editor-view .panel-workspace-name { display: block; overflow: hidden; margin-top: 4px; color: var(--muted); font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view .icon-button { width: 28px; height: 28px; padding: 0; }
.code-editor-view .small-button { padding: 5px 8px; font-size: 12px; }
.code-editor-view .ai-panel-header { align-items: flex-start; }
.code-editor-view .ai-header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
.code-editor-view .ai-context-length { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }
.code-editor-view .panel-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 12px 12px; }
.code-editor-view .panel-actions button:first-child { grid-column: 1 / -1; }
.code-editor-view .panel-actions button,
.code-editor-view .empty-state button { padding: 7px 10px; }
.code-editor-view .workspace-card { display: grid; gap: 3px; margin: 0 12px 8px; padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel-soft); }
.code-editor-view .workspace-name { overflow: hidden; font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view .workspace-card small { color: var(--muted); }
.code-editor-view .file-tree { flex: 1; min-height: 0; overflow: auto; padding: 4px 0 16px; }
.code-editor-view .tree-list { margin: 0; padding: 0; list-style: none; }
.code-editor-view .tree-row { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 24px; padding: 3px 8px; border: 0; border-radius: 0; background: transparent; color: var(--text); text-align: left; }
.code-editor-view .tree-row:hover,
.code-editor-view .tree-row.active { background: var(--button-hover); }
.code-editor-view .tree-row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view .tree-dirty { margin-left: auto; color: var(--accent-strong); font-size: 16px; line-height: 1; }
.code-editor-view .tree-row .chevron { width: 12px; color: var(--muted); text-align: center; }
.code-editor-view .tree-row .icon { width: 16px; color: var(--file-icon); font-size: 16px; text-align: center; }
.code-editor-view .tree-row .folder-icon { color: var(--folder-icon); }
.code-editor-view .file-js,
.code-editor-view .file-ts { color: #f7df1e !important; }
.code-editor-view .file-html { color: #e37933 !important; }
.code-editor-view .file-css,
.code-editor-view .file-scss { color: #42a5f5 !important; }
.code-editor-view .file-json,
.code-editor-view .file-yaml { color: #f1c40f !important; }
.code-editor-view .file-md { color: #8ab4f8 !important; }
.code-editor-view .file-py { color: #4b8bbe !important; }
.code-editor-view .file-go { color: #00add8 !important; }
.code-editor-view .file-rust { color: #ce6f2d !important; }
.code-editor-view .file-db { color: #b48ead !important; }
.code-editor-view .file-terminal { color: #89d185 !important; }
.code-editor-view .context-menu { position: fixed; z-index: 20; display: grid; min-width: 190px; padding: 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); box-shadow: 0 12px 32px var(--shadow); }
.code-editor-view .context-menu button { width: 100%; padding: 7px 10px; border: 0; border-radius: 4px; background: transparent; color: var(--text); text-align: left; }
.code-editor-view .context-menu button:hover:not(:disabled) { background: var(--context-hover); border-color: transparent; }
.code-editor-view .context-menu button.danger { color: #ffb3b3; }
.code-editor-view .context-separator { height: 1px; margin: 4px 6px; background: var(--border); }
.code-editor-view .settings-list { display: grid; gap: 12px; padding: 0 14px 18px; overflow: auto; }
.code-editor-view .search-form { display: grid; gap: 6px; padding: 0 12px 12px; }
.code-editor-view .search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; }
.code-editor-view .replace-row { grid-template-columns: minmax(0, 1fr) auto; }
.code-editor-view .search-form input { min-width: 0; border: 1px solid var(--border); border-radius: 4px; background: var(--input); color: var(--text); padding: 7px 8px; }
.code-editor-view .search-form input:focus { border-color: var(--accent-strong); outline: none; }
.code-editor-view .search-form button { padding: 7px 10px; }
.code-editor-view .search-form .search-option { min-width: 34px; padding: 7px 8px; color: var(--muted); font-weight: 700; }
.code-editor-view .search-form .search-option.active { border-color: var(--accent-strong); background: var(--context-hover); color: var(--text); }
.code-editor-view .search-results { min-height: 0; overflow: auto; padding: 0 0 16px; }
.code-editor-view .search-result-file { display: grid; gap: 1px; }
.code-editor-view .search-result-file-header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 7px; width: 100%; min-height: 30px; padding: 5px 12px; border: 0; border-radius: 0; background: transparent; color: var(--text); text-align: left; }
.code-editor-view .search-result-file-header:hover { background: var(--button-hover); }
.code-editor-view .search-result-file-header span:not(.codicon) { overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view .search-result-file-header small { color: var(--muted); font-size: 11px; }
.code-editor-view .search-result-match { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 6px; width: 100%; min-height: 26px; padding: 4px 12px 4px 34px; border: 0; border-radius: 0; background: transparent; color: var(--text); text-align: left; }
.code-editor-view .search-result-match:hover { background: var(--button-hover); }
.code-editor-view .search-result-match small { color: var(--muted); font-size: 11px; text-align: right; }
.code-editor-view .search-result-line { overflow: hidden; font-family: Consolas, 'Courier New', monospace; font-size: 12px; text-overflow: ellipsis; white-space: pre; }
.code-editor-view .search-result-line mark { border-radius: 2px; background: #f6d365; color: #1f1f1f; }
.code-editor-view .change-count { min-width: 24px; padding: 2px 7px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); text-align: center; }
.code-editor-view .changes-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 0 12px 10px; color: var(--muted); font-size: 12px; }
.code-editor-view .changes-toolbar button { padding: 5px 8px; font-size: 12px; }
.code-editor-view .changes-toolbar > span { margin-left: auto; }
.code-editor-view .change-select-all { display: flex; align-items: center; min-width: 0; gap: 6px; color: var(--text); }
.code-editor-view .change-select-all input,
.code-editor-view .change-row input[type="checkbox"] { flex: 0 0 auto; width: 14px; height: 14px; accent-color: var(--accent); }
.code-editor-view .changes-list { display: grid; align-content: start; gap: 2px; min-height: 0; overflow: auto; padding: 0 0 16px; }
.code-editor-view .change-row { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 38px; padding: 6px 12px; border: 0; border-radius: 0; background: transparent; color: var(--text); cursor: pointer; text-align: left; }
.code-editor-view .change-row:hover,
.code-editor-view .change-row.active { background: var(--button-hover); }
.code-editor-view .change-row:focus-visible { outline: 1px solid var(--accent-strong); outline-offset: -1px; }
.code-editor-view .change-row .codicon { color: var(--accent-strong); }
.code-editor-view .change-main { display: grid; min-width: 0; gap: 2px; }
.code-editor-view .change-main strong,
.code-editor-view .change-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view .change-main strong { font-size: 13px; font-weight: 600; }
.code-editor-view .change-main small { color: var(--muted); font-size: 11px; }
.code-editor-view .ssh-list { display: grid; align-content: start; gap: 8px; min-height: 0; overflow: auto; padding: 0 12px 16px; }
.code-editor-view .ssh-disabled-card strong { font-size: 13px; }
.code-editor-view .ssh-card { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--panel-soft); }
.code-editor-view .ssh-card.active { border-color: var(--accent-strong); }
.code-editor-view .ssh-card-main { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px; }
.code-editor-view .ssh-card-main > .codicon { color: var(--accent-strong); font-size: 17px; }
.code-editor-view .ssh-card-main div { display: grid; min-width: 0; gap: 2px; }
.code-editor-view .ssh-card-main strong,
.code-editor-view .ssh-card-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view .ssh-card-main strong { font-size: 13px; }
.code-editor-view .ssh-card-main small,
.code-editor-view .ssh-card-meta { color: var(--muted); font-size: 11px; }
.code-editor-view .ssh-card-meta { display: flex; flex-wrap: wrap; gap: 8px; }
.code-editor-view .ssh-card-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.code-editor-view .ssh-card-actions button { padding: 5px 7px; font-size: 12px; }
.code-editor-view .ssh-card-actions .danger { color: #ffb3b3; }
.code-editor-view .ai-session-bar { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: 8px; padding: 0 12px 10px; }
.code-editor-view .ai-session-select { display: grid; min-width: 0; gap: 5px; color: var(--muted); font-size: 12px; }
.code-editor-view .ai-session-select select { width: 100%; min-width: 0; border: 1px solid var(--border); border-radius: 4px; background: var(--input); color: var(--text); padding: 6px 7px; }
.code-editor-view .ai-chat { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-height: 0; flex: 1; }
.code-editor-view .ai-chat-messages { display: grid; align-content: start; gap: 10px; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 0 12px 12px; }
.code-editor-view .ai-message { display: grid; min-width: 0; gap: 5px; padding: 9px 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--panel-soft); }
.code-editor-view .ai-message strong { color: var(--accent-strong); font-size: 12px; }
.code-editor-view .ai-message-user strong { color: var(--text); }
.code-editor-view .ai-message-tool { opacity: 0.88; }
.code-editor-view .ai-tool-toggle { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 0; border: 0; background: transparent; color: var(--accent-strong); text-align: left; font-size: 12px; font-weight: 700; }
.code-editor-view .ai-tool-toggle:hover:not(:disabled) { background: transparent; border-color: transparent; }
.code-editor-view .ai-tool-details { display: grid; min-width: 0; max-width: 100%; gap: 8px; }
.code-editor-view .ai-tool-details > div { min-width: 0; max-width: 100%; }
.code-editor-view .ai-tool-details strong { display: block; margin-bottom: 4px; }
.code-editor-view .ai-tool-details pre { max-width: 100%; max-height: 240px; margin: 0; overflow-x: hidden; overflow-y: auto; overflow-wrap: anywhere; padding: 8px; border: 1px solid var(--border); border-radius: 5px; background: var(--editor); color: var(--text); font-family: Consolas, 'Courier New', monospace; font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.code-editor-view .ai-message-content { min-width: 0; max-width: 100%; overflow-wrap: anywhere; color: var(--text); font-size: 12px; word-break: break-word; }
.code-editor-view .ai-message-content * { max-width: 100%; }
.code-editor-view .ai-message-content pre { overflow-x: auto; white-space: pre-wrap; }
.code-editor-view .ai-message-content code { white-space: break-spaces; }
.code-editor-view .ai-message-content table { display: block; overflow-x: auto; }
.code-editor-view .ai-chat-form { display: grid; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid var(--border); background: var(--panel); }
.code-editor-view .ai-chat-form textarea { width: 100%; resize: vertical; min-height: 78px; max-height: 180px; border: 1px solid var(--border); border-radius: 5px; background: var(--input); color: var(--text); padding: 8px; line-height: 1.4; }
.code-editor-view .ai-chat-form button { padding: 7px 10px; }
.code-editor-view .ai-chat-options { display: grid; grid-template-columns: minmax(0, 1fr) minmax(90px, 0.8fr); gap: 8px; }
.code-editor-view .ai-chat-options label { display: grid; min-width: 0; gap: 5px; color: var(--muted); font-size: 12px; }
.code-editor-view .ai-chat-options select { width: 100%; min-width: 0; border: 1px solid var(--border); border-radius: 4px; background: var(--input); color: var(--text); padding: 6px 7px; }
.code-editor-view .setting-row { display: grid; gap: 6px; color: var(--text); font-size: 13px; }
.code-editor-view .setting-row input,
.code-editor-view .setting-row select,
.code-editor-view .setting-row textarea { width: 100%; border: 1px solid var(--border); border-radius: 4px; background: var(--input); color: var(--text); padding: 7px 8px; }
.code-editor-view .setting-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.code-editor-view .setting-title-row button { padding: 4px 8px; font-size: 12px; }
.code-editor-view .setting-action-button { padding: 7px 10px; }
.code-editor-view .setting-inline-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.code-editor-view .setting-inline-row button { padding: 7px 10px; }
.code-editor-view .keybinding-card { padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel-soft); }
.code-editor-view .shortcut-row { display: grid; grid-template-columns: 1fr minmax(86px, 110px); align-items: center; gap: 8px; }
.code-editor-view .setting-hint { color: var(--muted); line-height: 1.45; }
.code-editor-view .checkbox-row { display: flex; align-items: center; gap: 8px; }
.code-editor-view .checkbox-row input { width: auto; }
.code-editor-view .editor-shell { display: grid; grid-template-rows: 40px 36px minmax(0, 1fr) 26px; min-width: 0; min-height: 0; background: var(--editor); }
.code-editor-view .command-bar { display: flex; align-items: center; justify-content: center; min-width: 0; gap: 8px; padding: 5px 12px; border-bottom: 1px solid var(--border); background: var(--panel); }
.code-editor-view .command-center { display: grid; grid-template-columns: auto minmax(120px, 420px) auto; align-items: center; width: min(520px, 100%); height: 29px; padding: 0; border: 1px solid var(--border); border-radius: 6px; background: var(--input); color: var(--muted); text-align: left; box-shadow: inset 0 1px 0 rgb(255 255 255 / 4%); }
.code-editor-view .command-center:hover,
.code-editor-view .command-center:focus-visible { border-color: var(--accent-strong); background: var(--input); outline: none; box-shadow: 0 0 0 1px var(--accent-strong); }
.code-editor-view .command-center > .codicon { padding: 0 8px; font-size: 14px; }
.code-editor-view .command-center-label { min-width: 0; overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view .command-center-shortcut { margin-right: 6px; padding: 1px 5px; border: 1px solid var(--border); border-radius: 4px; color: var(--muted); font-size: 10px; line-height: 16px; }
.code-editor-view .command-icon-button { display: inline-grid; width: 29px; height: 29px; place-items: center; padding: 0; border-color: var(--border); background: var(--input); color: var(--muted); }
.code-editor-view .command-icon-button:hover:not(:disabled),
.code-editor-view .command-icon-button:focus-visible { border-color: var(--accent-strong); background: var(--input); color: var(--text); outline: none; }
.code-editor-view .command-icon-button.active { border-color: var(--accent-strong); background: var(--context-hover); color: var(--text); }
.code-editor-view .tabs { display: flex; min-width: 0; overflow-x: auto; overflow-y: hidden; background: var(--panel); border-bottom: 1px solid var(--border); }
.code-editor-view .tab { display: flex; align-items: center; gap: 8px; min-width: 120px; max-width: 240px; height: 35px; padding: 0 8px 0 12px; border: 0; border-right: 1px solid var(--border); border-radius: 0; background: var(--tab); color: var(--muted); }
.code-editor-view .tab.active { background: var(--tab-active); color: var(--text); }
.code-editor-view .tab-name { overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view .dirty-dot { color: #ffffff; font-size: 16px; line-height: 1; }
.code-editor-view .tab-close { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 3px; }
.code-editor-view .tab-close:hover { background: var(--button-hover); }
.code-editor-view .editor-stage { position: relative; min-width: 0; min-height: 0; }
.code-editor-view .monaco-host { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
.code-editor-view .monaco-host.visible { opacity: 1; pointer-events: auto; }
.code-editor-view .ssh-terminal { position: absolute; inset: 0; display: grid; grid-template-rows: 34px minmax(0, 1fr); min-width: 0; min-height: 0; background: var(--editor); }
.code-editor-view .ssh-terminal-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 12px; border-bottom: 1px solid var(--border); background: var(--panel); color: var(--text); font-size: 12px; font-weight: 600; }
.code-editor-view .ssh-terminal-header small { color: var(--muted); font-weight: 500; }
.code-editor-view .ssh-terminal-host { min-width: 0; min-height: 0; overflow: hidden; padding: 8px; }
.code-editor-view .ssh-terminal-host .terminal { height: 100%; }
.code-editor-view .ssh-terminal-fallback { min-width: 0; min-height: 0; margin: 0; overflow: auto; padding: 10px 12px; background: var(--editor); color: var(--text); font-family: Consolas, 'Courier New', monospace; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
.code-editor-view .editor-stage.preview-open .monaco-host.visible,
.code-editor-view .editor-stage.preview-open .unsupported-preview { right: var(--preview-pane-size); }
.code-editor-view .preview-pane { position: absolute; inset: 0 0 0 auto; z-index: 4; display: grid; grid-template-rows: 34px minmax(0, 1fr); width: var(--preview-pane-size); border-left: 1px solid var(--border); background: var(--editor); color: var(--text); box-shadow: -12px 0 24px rgb(0 0 0 / 14%); }
.code-editor-view .preview-pane-resizer { position: absolute; top: 0; left: -3px; z-index: 6; width: 6px; height: 100%; background: transparent; cursor: col-resize; }
.code-editor-view .preview-pane-resizer:hover,
.code-editor-view.preview-resizing .preview-pane-resizer { background: var(--accent); opacity: 0.35; }
.code-editor-view.preview-resizing .preview-frame { pointer-events: none; }
.code-editor-view .preview-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px 0 12px; border-bottom: 1px solid var(--border); background: var(--panel); color: var(--muted); font-size: 12px; font-weight: 600; }
.code-editor-view .preview-content { min-height: 0; overflow: auto; padding: 18px; background: var(--editor); color: var(--text); }
.code-editor-view .markdown-preview { font-size: 14px; line-height: 1.55; }
.code-editor-view .preview-frame { width: 100%; height: 100%; border: 0; background: #ffffff; color-scheme: light; }
.code-editor-view .image-preview { position: absolute; inset: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; align-items: center; justify-items: center; gap: 18px; padding: 24px; overflow: auto; background: var(--editor); }
.code-editor-view .image-preview img { max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 12px 32px var(--shadow); }
.code-editor-view .image-preview-meta { display: grid; justify-items: center; gap: 4px; max-width: min(680px, 100%); color: var(--muted); font-size: 12px; text-align: center; }
.code-editor-view .image-preview-meta strong { max-width: 100%; overflow: hidden; color: var(--text); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view .unsupported-preview { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 10px; padding: 28px; overflow: auto; background: var(--editor); color: var(--muted); text-align: center; }
.code-editor-view .unsupported-preview .codicon { color: var(--accent-strong); font-size: 42px; }
.code-editor-view .unsupported-preview h2 { margin: 0; color: var(--text); font-size: clamp(18px, 3vw, 28px); font-weight: 650; }
.code-editor-view .unsupported-preview p { max-width: 560px; margin: 0; line-height: 1.6; }
.code-editor-view .unsupported-preview small { max-width: min(680px, 100%); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view .empty-state { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 14px; padding: 28px; color: var(--muted); text-align: center; }
.code-editor-view .empty-state h2 { margin: 0; color: var(--text); font-size: clamp(22px, 4vw, 36px); font-weight: 650; }
.code-editor-view .empty-state p { max-width: 560px; margin: 0; line-height: 1.6; }
.code-editor-view .status-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 8px 0 10px; background: var(--status); color: var(--status-text); font-size: 12px; }
.code-editor-view .status-left-group,
.code-editor-view .status-right-group { display: flex; align-items: center; min-width: 0; gap: 8px; }
.code-editor-view .status-left-group { flex: 1; }
.code-editor-view .status-right-group { justify-content: flex-end; }
.code-editor-view .status-bar span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view #status-left { min-width: 0; }
.code-editor-view #save-file { flex: 0 0 auto; height: 20px; padding: 0 7px; border-color: var(--status-control-border); background: var(--status-control-bg); color: var(--status-text); font-size: 11px; }
.code-editor-view #save-file:hover:not(:disabled) { background: var(--status-control-hover); }
.code-editor-view .status-right-group select { width: 132px; height: 21px; border: 1px solid var(--border); border-radius: 3px; background: var(--editor); color: var(--text); font-size: 12px; }
.code-editor-view .status-right-group select:hover:not(:disabled),
.code-editor-view .status-right-group select:focus { border-color: var(--accent-strong); background: var(--input); color: var(--text); outline: none; }
.code-editor-view .status-right-group select:disabled { opacity: 0.5; }
.code-editor-view .editor-dialog-backdrop { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 18px; background: rgb(0 0 0 / 46%); backdrop-filter: blur(2px); }
.code-editor-view .editor-dialog { display: grid; gap: 14px; width: min(560px, 100%); max-height: min(760px, calc(100vh - 36px)); overflow: auto; padding: 18px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); color: var(--text); box-shadow: 0 20px 60px var(--shadow); }
.code-editor-view .editor-dialog-header { display: flex; align-items: center; gap: 10px; min-width: 0; }
.code-editor-view .editor-dialog-header .codicon { flex: 0 0 auto; color: var(--accent-strong); font-size: 18px; }
.code-editor-view .editor-dialog-header .codicon-warning,
.code-editor-view .editor-dialog-header .codicon-error { color: #ffb3b3; }
.code-editor-view .editor-dialog h2 { min-width: 0; margin: 0; overflow: hidden; font-size: 15px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.code-editor-view .editor-dialog-message { margin: 0; overflow-wrap: anywhere; color: var(--text); font-size: 13px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.code-editor-view .editor-dialog-input-row { display: grid; gap: 6px; color: var(--muted); font-size: 12px; }
.code-editor-view .editor-dialog-input-row input { width: 100%; border: 1px solid var(--border); border-radius: 5px; background: var(--input); color: var(--text); padding: 8px 9px; }
.code-editor-view .editor-dialog-input-row input:focus { border-color: var(--accent-strong); outline: none; box-shadow: 0 0 0 1px var(--accent-strong); }
.code-editor-view .ssh-dialog { width: min(620px, 100%); max-height: min(760px, calc(100vh - 36px)); overflow: auto; }
.code-editor-view .ssh-dialog-grid { display: grid; grid-template-columns: minmax(0, 1fr) 120px; gap: 10px; }
.code-editor-view .editor-dialog-actions { position: sticky; bottom: -18px; display: flex; justify-content: flex-end; gap: 8px; margin: 0 -18px -18px; padding: 12px 18px 18px; border-top: 1px solid var(--border); background: var(--panel); }
.code-editor-view .editor-dialog-actions button { min-width: 76px; padding: 7px 12px; }
.code-editor-view .editor-dialog-actions .primary { border-color: var(--accent); background: var(--accent); color: #ffffff; }
.code-editor-view .editor-dialog-actions .primary:hover:not(:disabled) { border-color: var(--accent-strong); background: var(--accent-strong); }
.code-editor-view .editor-dialog-actions .primary.danger { border-color: #b8383d; background: #b8383d; }
.code-editor-view .editor-dialog-actions .primary.danger:hover:not(:disabled) { border-color: #d95055; background: #d95055; }

@media (max-width: 760px) {
  .code-editor-view.app-shell { grid-template-columns: 44px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); height: 100dvh; }
  .code-editor-view.app-shell.side-panel-hidden { grid-template-columns: 44px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .code-editor-view .activity-bar { grid-row: 1 / -1; }
  .code-editor-view .editor-shell { grid-column: 2; grid-row: 1; }
  .code-editor-view .side-panel { z-index: 2; grid-column: 2; grid-row: 1; border-top: 0; border-right: 0; }
  .code-editor-view.side-panel-hidden .side-panel { display: none; }
  .code-editor-view .side-panel-resizer { display: none; }
  .code-editor-view .activity-button { width: 44px; height: 44px; }
  .code-editor-view .panel-actions { grid-template-columns: 1fr; }
  .code-editor-view .panel-actions button:first-child { grid-column: auto; }
  .code-editor-view .shortcut-row { grid-template-columns: 1fr; }
  .code-editor-view .command-center-shortcut { display: none; }
  .code-editor-view .status-right-group { display: none; }
  .code-editor-view .editor-stage.preview-open .monaco-host.visible,
  .code-editor-view .editor-stage.preview-open .unsupported-preview { right: 0; bottom: 45%; }
  .code-editor-view .preview-pane { inset: auto 0 0 0; width: auto; height: 45%; border-top: 1px solid var(--border); border-left: 0; box-shadow: 0 -12px 24px rgb(0 0 0 / 14%); }
  .code-editor-view .preview-pane-resizer { display: none; }
  .code-editor-view .editor-dialog-actions { flex-direction: column-reverse; }
  .code-editor-view .editor-dialog-actions button { width: 100%; }
}
</style>
