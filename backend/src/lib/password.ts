import bcrypt from 'bcryptjs';
import { config } from '../config';

export const hashPassword = (plain: string) => bcrypt.hash(plain, config.auth.bcryptRounds);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
