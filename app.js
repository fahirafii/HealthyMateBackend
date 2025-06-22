// Import library
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Konfigurasi express js
const app = express();
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const upload = multer({ dest: 'uploads/' });
app.use(bodyParser.json());

app.use(cors());
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

const SECRET = process.env.JWT_SECRET || 'secret';

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'healthymateforum',
  multipleStatements: true,
});

//API handle
app.get('/', async (req, res) => {
  res.json({ message: 'Test Ok' });
});

app.post('/fahira', async (req, res) => {
  res.json({ message: 'halo fahir' });
});


function openQuery(ssql, lastSelect = false) {
  return new Promise(async (resolve, reject) => {
    try {
      const [results, fields] = await db.query(ssql);
      if (lastSelect == false) {
        resolve({
          status: 'true',
          data: results,
        })
      } else {
        resolve({
          status: 'true',
          data: results[results.length - 1]
        })
      }
    } catch (err) {
      resolve({
        status: 'false',
        error: err.message,
      });
    }

  })
}


app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(401).json({
        status: 'false',
        message: 'Email and password are required'
      });
    }

    const checkDataUser = await openQuery(`select * from users where email = "${email}"; `);
    if (checkDataUser.status == 'false') {
      return res.status(500).json({
        status: 'false',
        message: 'Something wrong'
      });
    } else if (checkDataUser.data.length > 0) {
      return res.status(401).json({
        status: 'false',
        message: 'Email already used'
      });
    }


    const dataUser = await openQuery(`
      insert into users (email, password, name) values ("${email}", "${password}", "${name}");
      select * from users where id= LAST_INSERT_ID();
    `, true);
    if (dataUser.status == 'false') {
      return res.status(500).json({
        status: 'false',
        message: 'Something wrong'
      });
    } else if (dataUser.data.length == 0) {
      return res.status(400).json({
        status: 'false',
        message: 'Failed to register user'
      });
    }

    const token = jwt.sign({
      id: dataUser.data[0].id,
      name: dataUser.data[0].name,
      email: dataUser.data[0].email
    }, SECRET, {
      expiresIn: '1d'
    });

    res.json({
      status: 'true',
      token: token,
      message: 'Registration successful'
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 'false',
      message: 'Internal server error'
    });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {

    const dataUser = await openQuery('select * from users where email = "' + email + '" and password = "' + password + '"');
    if (dataUser.status == 'false') {
      return res.status(500).json({
        status: 'false',
        message: 'Something wrong'
      });
    } else if (dataUser.data.length == 0) {
      return res.status(401).json({
        status: 'false',
        message: 'Account not found'
      });
    }

    const token = jwt.sign({
      id: dataUser.data[0].id,
      name: dataUser.data[0].name,
      email: dataUser.data[0].email
    }, SECRET, {
      expiresIn: '1d'
    });

    res.json({
      status: 'true',
      token: token,
      message: 'Login successful'
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 'false',
      message: 'Internal server error'
    });

  }
});

app.post('/check_session', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({
    status: 'false',
    message: 'Unauthorized'
  });

  try {
    const decoded = jwt.verify(token, SECRET);
    res.json({
      status: 'true',
      message: 'Session is valid',
      user: decoded
    });
  } catch (err) {
    res.status(401).json({
      status: 'false',
      message: 'Invalid token'
    });
  }
});

app.post('/logout', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({
    status: 'true',
    message: 'Unauthorized'
  });
  try {
    jwt.verify(token, SECRET);
    res.json({ status: 'true', message: 'Logout successful' });
  } catch (err) {
    res.status(401).json({
      status: 'false',
      message: 'Invalid token'
    });
  }
});

app.post('/create_post', upload.single('image'), async (req, res) => {
  if (req.file) {
    req.file.pathname = path.resolve(req.file.path); 
    req.file.filetype = req.file.mimetype;
    req.file.setname = req.file.originalname; 

    const newFilename = req.file.filename + path.extname(req.file.originalname);
    const newPath = path.join(req.file.destination, newFilename);
    fs.renameSync(req.file.path, newPath);
    req.file.savedAs = newFilename;
  }
  const { token, description } = req.body;
  if (!token) return res.status(401).json({
    status: 'false',
    message: 'Unauthorized'
  });

  try {
    const decoded = jwt.verify(token, SECRET);
    const userId = decoded.id;

    if (!description) {
      return res.status(400).json({
        status: 'true',
        message: 'Content is required'
      });
    }

    let imagePath = '';
    if (req.file) {
      imagePath = req.file.savedAs; 
    }

    const result = await openQuery(`
      insert into posts (user_id,content,image,created_at) 
      values ("${userId}", "${description}", "${imagePath}", NOW());
    `, true);
    if (result.status == 'false') {
      return res.status(500).json({
        status: 'true',
        message: 'Failed to create post'
      });
    }

    res.json({
      status: 'true',
      message: 'Post created successfully',
      image: imagePath
    });
  } catch (err) {
    res.status(401).json({
      status: 'false',
      message: 'Invalid token'
    });
  }
});

app.delete('/delete_post', async (req, res) => {
  const { token, post_id } = req.body;
  if (!token) return res.status(401).json({
    status: 'false',
    message: 'Unauthorized'
  });

  try {
    const decoded = jwt.verify(token, SECRET);
    const userId = decoded.id;

    const result = await openQuery(`select * from posts where id = "${post_id}";`, false);
    if (result.status == 'false') {
      return res.status(500).json({
        status: 'true',
        message: 'Failed to create post'
      });
    }

    if (result.data.length == 0) {
      return res.status(404).json({
        status: 'false',
        message: 'Post not found'
      });
    }

    const deleteResult = await openQuery(`
      delete from comments where post_id = "${post_id}";
      delete from posts where id = "${post_id}";
    `, false);
    console.log(deleteResult);
    if (deleteResult.status == 'false') {
      return res.status(500).json({
        status: 'true',
        message: 'Failed to delete post'
      });
    }

    res.json({
      status: 'true',
      message: 'Post deleted successfully',
    });
  } catch (err) {
    res.status(401).json({
      status: 'false',
      message: 'Invalid token'
    });
  }
});


app.post('/posts', async (req, res) => {
  const { token, filter_post } = req.body;
  if (!token) return res.status(401).json({
    status: 'false',
    message: 'Unauthorized'
  });

  try {
    const decoded = jwt.verify(token, SECRET);
    const userId = decoded.id;

    let pathFolderFile = 'uploads'

    let ssql = ''
    if (filter_post == 'newest') {
      ssql = `
        select a.id, a.content, a.image, b.name, a.created_at,
        if(${userId}<>user_id,'false','true') as status_delete,
        (select count(*) from likes c where c.post_id = a.id) as total_likes,
        (select count(*) from likes d where d.post_id = a.id and d.user_id = ${userId}) as is_liked,
        if(a.image='','',concat('${pathFolderFile}/', a.image)) as image_path 
        from posts a
        left join users b on b.id = a.user_id
        order by a.created_at desc;
      `
    } else if (filter_post == 'favorite') {
      ssql = `
        select a.id, a.content, a.image, b.name, a.created_at,
        if(${userId}<>user_id,'false','true') as status_delete,
        (select count(*) from likes c where c.post_id = a.id) as total_likes,
        (select count(*) from likes d where d.post_id = a.id and d.user_id = ${userId}) as is_liked,
        if(a.image='','',concat('${pathFolderFile}/', a.image)) as image_path 
        from posts a
        left join users b on b.id = a.user_id
        order by total_likes desc;
      `
    } else {
      ssql = `
        select a.id, a.content, a.image, b.name, a.created_at,
        if(${userId}<>user_id,'false','true') as status_delete,
        (select count(*) from likes c where c.post_id = a.id) as total_likes,
        (select count(*) from likes d where d.post_id = a.id and d.user_id = ${userId}) as is_liked,
        if(a.image='','',concat('${pathFolderFile}/', a.image)) as image_path 
        from posts a
        left join users b on b.id = a.user_id
        order by a.created_at desc;
      `
    }

    const dataPosts = await openQuery(ssql);
    if (dataPosts.status == 'false') {
      return res.status(500).json({
        status: 'false',
        message: 'Something went wrong while fetching posts'
      });
    }

    res.json({
      status: 'true',
      data: dataPosts.data
    });
  } catch (err) {
    res.status(500).json({
      status: 'false',
      message: 'Internal server error'
    });
  }
}
);

app.delete('/delete_post', async (req, res) => {
  const { token, description } = req.body;
  if (!token) return res.status(401).json({
    status: 'false',
    message: 'Unauthorized'
  });

  try {
    const decoded = jwt.verify(token, SECRET);
    const userId = decoded.id;

    if (!description) {
      return res.status(400).json({
        status: 'true',
        message: 'Content is required'
      });
    }

    const result = await openQuery(`
      insert into posts (user_id,content,image,created_at) 
      values ("${userId}", "${description}", "", NOW());
    `, true);
    if (result.status == 'false') {
      return res.status(500).json({
        status: 'true',
        message: 'Failed to create post'
      });
    }

    res.json({
      status: 'true',
      message: 'Post created successfully',
    });
  } catch (err) {
    res.status(401).json({
      status: 'false',
      message: 'Invalid token'
    });
  }
});

app.get('/comments/:post_id', async (req, res) => {
  const postId = req.params.post_id;

  try {
    const dataComments = await openQuery(`
      select a.id, a.comment, a.created_at, b.name
      from comments a
      left join users b on b.id = a.user_id
      where a.post_id = "${postId}"
      order by a.created_at desc;
    `);
    if (dataComments.status == 'false') {
      return res.status(500).json({
        status: 'false',
        message: 'Something went wrong while fetching comments'
      });
    }

    res.json({
      status: 'true',
      data: dataComments.data
    });
  } catch (err) {
    res.status(500).json({
      status: 'false',
      message: 'Internal server error'
    });
  }
}
);

app.post('/create_comment', async (req, res) => {
  const { token, post_id, message } = req.body;
  if (!token) return res.status(401).json({
    status: 'false',
    message: 'Unauthorized'
  });

  try {
    const decoded = jwt.verify(token, SECRET);
    const userId = decoded.id;

    if (!message) {
      return res.status(400).json({
        status: 'true',
        message: 'Message is required'
      });
    }

    const result = await openQuery(`
      insert into comments (user_id,post_id,comment,created_at) 
      values ("${userId}", "${post_id}", "${message}", NOW());
    `, true);
    if (result.status == 'false') {
      return res.status(500).json({
        status: 'true',
        message: 'Failed to create comment'
      });
    }

    res.json({
      status: 'true',
      message: 'Comment created successfully',
    });
  } catch (err) {
    res.status(401).json({
      status: 'false',
      message: 'Invalid token'
    });
  }
});

app.post('/delete_comment', async (req, res) => {
  const { token, description } = req.body;
  if (!token) return res.status(401).json({
    status: 'false',
    message: 'Unauthorized'
  });

  try {
    const decoded = jwt.verify(token, SECRET);
    const userId = decoded.id;

    if (!description) {
      return res.status(400).json({
        status: 'true',
        message: 'Content is required'
      });
    }

    const result = await openQuery(`
      insert into posts (user_id,content,image,created_at) 
      values ("${userId}", "${description}", "", NOW());
    `, true);
    if (result.status == 'false') {
      return res.status(500).json({
        status: 'true',
        message: 'Failed to create post'
      });
    }

    res.json({
      status: 'true',
      message: 'Post created successfully',
    });
  } catch (err) {
    res.status(401).json({
      status: 'false',
      message: 'Invalid token'
    });
  }
});


app.post('/add_like', async (req, res) => {
  const { token, post_id } = req.body;
  if (!token) return res.status(401).json({
    status: 'false',
    message: 'Unauthorized'
  });

  try {
    const decoded = jwt.verify(token, SECRET);
    const userId = decoded.id;

    const likeExists = await openQuery(`
      select * from likes where user_id = "${userId}" and post_id = "${post_id}";
    `);
    if (likeExists.status == 'false') {
      return res.status(500).json({
        status: 'false',
        message: 'Something went wrong while checking like'
      });
    }
    if (likeExists.data.length > 0) {
      return res.status(400).json({
        status: 'false',
        message: 'You have already liked this post'
      });
    }

    const result = await openQuery(`
      insert into likes (user_id, post_id) values ("${userId}", "${post_id}");
    `, true);
    if (result.status == 'false') {
      return res.status(500).json({
        status: 'true',
        message: 'Failed to create post'
      });
    }

    res.json({
      status: 'true',
      message: 'Like successfully',
    });
  } catch (err) {
    console.log(err);
    res.status(401).json({
      status: 'false',
      message: 'Invalid token'
    });
  }
});

app.delete('/delete_like', async (req, res) => {
  const { token, post_id } = req.body;
  if (!token) return res.status(401).json({
    status: 'false',
    message: 'Unauthorized'
  });

  try {
    const decoded = jwt.verify(token, SECRET);
    const userId = decoded.id;

    const result = await openQuery(`
      delete from likes where user_id = "${userId}" and post_id = "${post_id}";
    `, true);
    if (result.status == 'false') {
      return res.status(500).json({
        status: 'true',
        message: 'Failed to create post'
      });
    }

    res.json({
      status: 'true',
      message: 'Unlike successfully',
    });
  } catch (err) {
    res.status(401).json({
      status: 'false',
      message: 'Invalid token'
    });
  }
});

app.delete('/delete_account', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({
    status: 'false',
    message: 'Unauthorized'
  });

  try {
    const decoded = jwt.verify(token, SECRET);
    const userId = decoded.id;

    const result = await openQuery(`
      delete from comments where user_id = "${userId}";
      delete from likes where user_id = "${userId}";
      delete from comments where post_id in (select id from posts where user_id = "${userId}");
      delete from likes where post_id in (select id from posts where user_id = "${userId}");
      delete from posts where user_id = "${userId}";
      delete from users where id = "${userId}";
    `);
    if (result.status == 'false') {
      return res.status(500).json({
        status: 'false',
        message: 'Failed to delete account'
      });
    }

    res.json({
      status: 'true',
      message: 'Delete account successfully',
    });
  } catch (err) {
    res.status(401).json({
      status: 'false',
      message: 'Invalid token'
    });
  }
});



const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));