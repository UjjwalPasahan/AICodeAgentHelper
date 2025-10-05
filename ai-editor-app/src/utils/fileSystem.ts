import type { FileItem } from '../types';

export const processDirectory = async (dirHandle: any, path = ''): Promise<FileItem[]> => {
  const files: FileItem[] = [];
  
  for await (const entry of dirHandle.values()) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    
    const relativePath = path ? `${path}/${entry.name}` : entry.name;
    
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      const content = await file.text();
      files.push({
        id: relativePath,
        name: entry.name,
        type: 'file',
        content
      });
    } else if (entry.kind === 'directory') {
      const children = await processDirectory(entry, relativePath);
      files.push({
        id: relativePath,
        name: entry.name,
        type: 'folder',
        children
      });
    }
  }
  
  return files;
};