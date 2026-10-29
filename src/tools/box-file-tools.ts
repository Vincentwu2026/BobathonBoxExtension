import { z } from 'zod';
import { Readable } from 'node:stream';
import { getBoxClient } from '../box-client.js';
import { withRateLimitRetry } from '../util/rate-limiter.js';

/**
 * Standard tool response formatter helper.
 */
export function formatSuccess(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function formatError(message: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            isError: true,
            message,
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}

// ============================================================================
// TOOL 1: box_search
// ============================================================================
export const boxSearchSchema = {
  query: z.string().describe('Search term or phrase to search within Box file names, descriptions, and full-text content'),
  limit: z.number().int().min(1).max(200).optional().default(20).describe('Maximum number of items to return (default 20, max 200)'),
  offset: z.number().int().min(0).optional().default(0).describe('Paging offset index (default 0)'),
  fileExtensions: z.array(z.string()).optional().describe('Filter by specific file extensions, e.g. ["pdf", "docx", "ts"]'),
  ancestorFolderIds: z.array(z.string()).optional().describe('Scope search to descendant items of specified folder IDs'),
  type: z.enum(['file', 'folder', 'web_link']).optional().describe('Filter by Box object type'),
};

export async function handleBoxSearch(args: z.infer<z.ZodObject<typeof boxSearchSchema>>) {
  try {
    const client = await getBoxClient();

    const queryParams: any = {
      query: args.query,
      limit: args.limit,
      offset: args.offset,
    };

    if (args.fileExtensions && args.fileExtensions.length > 0) {
      queryParams.fileExtensions = args.fileExtensions;
    }
    if (args.ancestorFolderIds && args.ancestorFolderIds.length > 0) {
      queryParams.ancestorFolderIds = args.ancestorFolderIds;
    }
    if (args.type) {
      queryParams.type = args.type;
    }

    const response = await withRateLimitRetry(
      () => client.search.searchForContent(queryParams),
      {},
      'box_search'
    );

    const items = response.entries?.map((entry: any) => ({
      id: entry.id,
      type: entry.type,
      name: entry.name,
      description: entry.description,
      size: entry.size,
      modifiedAt: entry.modifiedAt || entry.modified_at,
      createdAt: entry.createdAt || entry.created_at,
      createdBy: entry.createdBy ? { id: entry.createdBy.id, name: entry.createdBy.name, login: entry.createdBy.login } : undefined,
      parent: entry.parent ? { id: entry.parent.id, name: entry.parent.name } : undefined,
      pathCollection: entry.pathCollection?.entries?.map((p: any) => ({ id: p.id, name: p.name })),
      url: `https://app.box.com/${entry.type === 'folder' ? 'folder' : 'file'}/${entry.id}`,
    })) || [];

    return formatSuccess({
      totalCount: response.totalCount || items.length,
      limit: response.limit || args.limit,
      offset: response.offset || args.offset,
      items,
    });
  } catch (error: any) {
    return formatError(`Box Search failed: ${error?.message || String(error)}`);
  }
}

// ============================================================================
// TOOL 2: box_get_file
// ============================================================================
export const boxGetFileSchema = {
  fileId: z.string().describe('The unique Box File ID'),
  fields: z.array(z.string()).optional().describe('Optional list of specific fields to retrieve (e.g. ["name", "size", "shared_link", "modified_at", "path_collection"])'),
};

export async function handleBoxGetFile(args: z.infer<z.ZodObject<typeof boxGetFileSchema>>) {
  try {
    const client = await getBoxClient();
    const queryParams = args.fields && args.fields.length > 0 ? { fields: args.fields } : undefined;

    const file = await withRateLimitRetry(
      () => client.files.getFileById(args.fileId, queryParams ? { queryParams } : undefined),
      {},
      'box_get_file'
    );

    return formatSuccess({
      id: file.id,
      type: file.type,
      name: file.name,
      size: file.size,
      sha1: file.sha1,
      description: file.description,
      createdAt: file.createdAt,
      modifiedAt: file.modifiedAt,
      contentCreatedAt: file.contentCreatedAt,
      contentModifiedAt: file.contentModifiedAt,
      createdBy: file.createdBy ? { id: file.createdBy.id, name: file.createdBy.name, login: file.createdBy.login } : null,
      modifiedBy: file.modifiedBy ? { id: file.modifiedBy.id, name: file.modifiedBy.name, login: file.modifiedBy.login } : null,
      ownedBy: file.ownedBy ? { id: file.ownedBy.id, name: file.ownedBy.name, login: file.ownedBy.login } : null,
      parent: file.parent ? { id: file.parent.id, name: file.parent.name } : null,
      pathCollection: file.pathCollection?.entries?.map((p: any) => ({ id: p.id, name: p.name })),
      sharedLink: file.sharedLink ? { url: file.sharedLink.url, access: file.sharedLink.access } : null,
      versionNumber: file.versionNumber,
      url: `https://app.box.com/file/${file.id}`,
    });
  } catch (error: any) {
    return formatError(`Box Get File failed: ${error?.message || String(error)}`);
  }
}

// ============================================================================
// TOOL 3: box_list_folder
// ============================================================================
export const boxListFolderSchema = {
  folderId: z.string().optional().default('0').describe('The Box Folder ID to list contents for (defaults to "0" for enterprise root)'),
  limit: z.number().int().min(1).max(500).optional().default(50).describe('Maximum items to return in current page (default 50, max 500)'),
  offset: z.number().int().min(0).optional().default(0).describe('Paging offset index (default 0)'),
  sort: z.enum(['name', 'date', 'size']).optional().describe('Field to sort entries by'),
  direction: z.enum(['ASC', 'DESC']).optional().describe('Sort direction: ASC or DESC'),
};

export async function handleBoxListFolder(args: z.infer<z.ZodObject<typeof boxListFolderSchema>>) {
  try {
    const client = await getBoxClient();
    const queryParams: any = {
      limit: args.limit,
      offset: args.offset,
      fields: ['id', 'type', 'name', 'size', 'modified_at', 'created_at', 'owned_by', 'item_status'],
    };
    if (args.sort) queryParams.sort = args.sort;
    if (args.direction) queryParams.direction = args.direction;

    const response = await withRateLimitRetry(
      () => client.folders.getFolderItems(args.folderId || '0', { queryParams }),
      {},
      'box_list_folder'
    );

    const items = response.entries?.map((entry: any) => ({
      id: entry.id,
      type: entry.type,
      name: entry.name,
      size: entry.size || 0,
      modifiedAt: entry.modifiedAt || entry.modified_at,
      createdAt: entry.createdAt || entry.created_at,
      itemStatus: entry.itemStatus || entry.item_status,
      url: `https://app.box.com/${entry.type === 'folder' ? 'folder' : 'file'}/${entry.id}`,
    })) || [];

    return formatSuccess({
      folderId: args.folderId || '0',
      totalCount: response.totalCount || items.length,
      limit: response.limit || args.limit,
      offset: response.offset || args.offset,
      order: response.order,
      entries: items,
    });
  } catch (error: any) {
    return formatError(`Box List Folder failed: ${error?.message || String(error)}`);
  }
}

// ============================================================================
// TOOL 4: box_upload_file
// ============================================================================
export const boxUploadFileSchema = {
  name: z.string().describe('File name including extension, e.g. "report.docx" or "analysis.json"'),
  parentFolderId: z.string().optional().default('0').describe('Target parent folder ID (defaults to "0" for root)'),
  content: z.string().describe('The content of the file. Plain UTF-8 text or Base64 string if isBase64 is true'),
  isBase64: z.boolean().optional().default(false).describe('Set to true if content is base64-encoded binary data'),
};

export async function handleBoxUploadFile(args: z.infer<z.ZodObject<typeof boxUploadFileSchema>>) {
  try {
    const client = await getBoxClient();
    const buffer = args.isBase64
      ? Buffer.from(args.content, 'base64')
      : Buffer.from(args.content, 'utf-8');

    const byteStream = Readable.from(buffer);

    const response = await withRateLimitRetry(
      () =>
        client.uploads.uploadFile({
          attributes: {
            name: args.name,
            parent: {
              id: args.parentFolderId || '0',
            },
          },
          file: byteStream,
        }),
      {},
      'box_upload_file'
    );

    const uploaded = response.entries?.[0];
    return formatSuccess({
      success: true,
      file: uploaded
        ? {
            id: uploaded.id,
            name: uploaded.name,
            size: uploaded.size,
            createdAt: uploaded.createdAt,
            modifiedAt: uploaded.modifiedAt,
            parent: uploaded.parent ? { id: uploaded.parent.id, name: uploaded.parent.name } : null,
            url: `https://app.box.com/file/${uploaded.id}`,
          }
        : null,
    });
  } catch (error: any) {
    return formatError(`Box Upload File failed: ${error?.message || String(error)}`);
  }
}

// ============================================================================
// TOOL 5: box_move_file
// ============================================================================
export const boxMoveFileSchema = {
  fileId: z.string().describe('The ID of the file to move or rename'),
  destinationFolderId: z.string().describe('The ID of the new parent folder to move the file into'),
  newName: z.string().optional().describe('Optional new name for the file after moving'),
};

export async function handleBoxMoveFile(args: z.infer<z.ZodObject<typeof boxMoveFileSchema>>) {
  try {
    const client = await getBoxClient();

    const requestBody: any = {
      parent: {
        id: args.destinationFolderId,
      },
    };

    if (args.newName) {
      requestBody.name = args.newName;
    }

    const updated = await withRateLimitRetry(
      () => client.files.updateFileById(args.fileId, { requestBody }),
      {},
      'box_move_file'
    );

    return formatSuccess({
      success: true,
      file: {
        id: updated.id,
        name: updated.name,
        size: updated.size,
        modifiedAt: updated.modifiedAt,
        parent: updated.parent ? { id: updated.parent.id, name: updated.parent.name } : null,
        pathCollection: updated.pathCollection?.entries?.map((p: any) => ({ id: p.id, name: p.name })),
        url: `https://app.box.com/file/${updated.id}`,
      },
    });
  } catch (error: any) {
    return formatError(`Box Move File failed: ${error?.message || String(error)}`);
  }
}

// ============================================================================
// TOOL 6: box_list_collaborators
// ============================================================================
export const boxListCollaboratorsSchema = {
  fileId: z.string().optional().describe('Box File ID to inspect collaborators for'),
  folderId: z.string().optional().describe('Box Folder ID to inspect collaborators for (provide either fileId or folderId)'),
};

export async function handleBoxListCollaborators(args: z.infer<z.ZodObject<typeof boxListCollaboratorsSchema>>) {
  try {
    if (!args.fileId && !args.folderId) {
      return formatError('Either fileId or folderId must be provided to list collaborators.');
    }

    const client = await getBoxClient();
    let entries: readonly any[] = [];

    if (args.fileId) {
      const response = await withRateLimitRetry(
        () => client.listCollaborations.getFileCollaborations(args.fileId!),
        {},
        'box_list_collaborators_file'
      );
      entries = response.entries || [];
    } else if (args.folderId) {
      const response = await withRateLimitRetry(
        () => client.listCollaborations.getFolderCollaborations(args.folderId!),
        {},
        'box_list_collaborators_folder'
      );
      entries = response.entries || [];
    }

    const collaborators = entries.map((collab: any) => ({
      id: collab.id,
      role: collab.role,
      status: collab.status,
      createdAt: collab.createdAt,
      modifiedAt: collab.modifiedAt,
      accessibleBy: collab.accessibleBy
        ? {
            id: collab.accessibleBy.id,
            type: collab.accessibleBy.type,
            name: collab.accessibleBy.name,
            login: 'login' in collab.accessibleBy ? (collab.accessibleBy as any).login : undefined,
          }
        : null,
      createdBy: collab.createdBy
        ? {
            id: collab.createdBy.id,
            name: collab.createdBy.name,
            login: collab.createdBy.login,
          }
        : null,
    }));

    return formatSuccess({
      targetType: args.fileId ? 'file' : 'folder',
      targetId: args.fileId || args.folderId,
      collaboratorCount: collaborators.length,
      activeCollaboratorCount: collaborators.filter((c) => c.status === 'accepted' || !c.status).length,
      collaborators,
    });
  } catch (error: any) {
    return formatError(`Box List Collaborators failed: ${error?.message || String(error)}`);
  }
}

// ============================================================================
// TOOL 7: box_get_file_versions
// ============================================================================
export const boxGetFileVersionsSchema = {
  fileId: z.string().describe('The Box File ID to retrieve version history for'),
};

export async function handleBoxGetFileVersions(args: z.infer<z.ZodObject<typeof boxGetFileVersionsSchema>>) {
  try {
    const client = await getBoxClient();

    const response = await withRateLimitRetry(
      () => client.fileVersions.getFileVersions(args.fileId),
      {},
      'box_get_file_versions'
    );

    const versions = (response.entries || []).map((ver: any) => ({
      id: ver.id,
      type: ver.type,
      sha1: ver.sha1,
      name: ver.name,
      size: ver.size,
      createdAt: ver.createdAt,
      modifiedAt: ver.modifiedAt,
      modifiedBy: ver.modifiedBy
        ? {
            id: ver.modifiedBy.id,
            name: ver.modifiedBy.name,
            login: ver.modifiedBy.login,
          }
        : null,
      trashedAt: ver.trashedAt,
    }));

    return formatSuccess({
      fileId: args.fileId,
      totalCount: response.totalCount || versions.length,
      versions,
    });
  } catch (error: any) {
    return formatError(`Box Get File Versions failed: ${error?.message || String(error)}`);
  }
}
