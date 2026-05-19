import { Env } from '../types';
import { feishuPost } from './auth';

export interface CreateChatResult {
  chat_id: string;
}

export interface AddMembersResult {
  invalid_id_list: string[];
}

export async function createGroup(
  env: Env,
  name: string,
  ownerId: string,
  memberIds: string[]
): Promise<{ chatId: string | null; error: string | null }> {
  try {
    // Filter out owner from members list
    const membersToAdd = memberIds.filter(id => id !== ownerId);

    const result = await feishuPost<CreateChatResult>(env, '/im/v1/chats', {
      name,
      owner_id: ownerId,
      user_id_list: membersToAdd
    });

    return { chatId: result.chat_id, error: null };
  } catch (error) {
    return { chatId: null, error: String(error) };
  }
}

export async function addGroupMembers(
  env: Env,
  chatId: string,
  memberIds: string[]
): Promise<boolean> {
  if (!memberIds.length) return true;

  try {
    const result = await feishuPost<AddMembersResult>(
      env,
      `/im/v1/chats/${chatId}/members`,
      { id_list: memberIds }
    );

    if (result.invalid_id_list?.length) {
      console.warn('Some members could not be added:', result.invalid_id_list);
    }

    return true;
  } catch (error) {
    console.warn('Failed to add members:', error);
    return false;
  }
}